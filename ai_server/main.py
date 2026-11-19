"""
SafeKeep — AI Model Server & Protected Workflows
=================================================
Uses BLIP for image captioning and CLIP for embedding-based matching.
Integrates with Appwrite for authentication validation, document persistence,
and server-side PBKDF2 ownership verification.
"""

import io
import os
import logging
import re
import json
import base64
import hmac
import hashlib
import secrets
import uuid
from typing import Optional
from contextlib import asynccontextmanager

import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from fuzzy_verification import verify_answer_relation

# Optional PyTorch & HuggingFace Transformers
try:
    import torch
    from transformers import BlipProcessor, BlipForConditionalGeneration, CLIPProcessor, CLIPModel
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    BlipProcessor = None
    BlipForConditionalGeneration = None
    CLIPProcessor = None
    CLIPModel = None
    TORCH_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    easyocr = None
    EASYOCR_AVAILABLE = False

# ─── Config ───────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(BASE_DIR, ".env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
DEFAULT_CACHE = os.path.join(BASE_DIR, "model_cache")
MODEL_CACHE = os.getenv("MODEL_CACHE", DEFAULT_CACHE)
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.60"))
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT", "").rstrip("/")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "safekeep")
APPWRITE_ITEMS_COLLECTION_ID = os.getenv("APPWRITE_ITEMS_COLLECTION_ID", "items")
APPWRITE_VERIFICATIONS_COLLECTION_ID = os.getenv("APPWRITE_VERIFICATIONS_COLLECTION_ID", "verifications")
APPWRITE_MATCHES_COLLECTION_ID = os.getenv("APPWRITE_MATCHES_COLLECTION_ID", "matches")
APPWRITE_CLAIMS_COLLECTION_ID = os.getenv("APPWRITE_CLAIMS_COLLECTION_ID", "claims")
APPWRITE_MESSAGES_COLLECTION_ID = os.getenv("APPWRITE_MESSAGES_COLLECTION_ID", "messages")
APPWRITE_BUCKET_ID = os.getenv("APPWRITE_BUCKET_ID", "item_images")
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS", "*").strip()
if CORS_ORIGINS_RAW == "*":
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_RAW.split(",") if origin.strip()]

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("safekeep_ai")

# ─── Global model holders ─────────────────────────────────────────
blip_processor = None
blip_model = None
clip_processor = None
clip_model = None
ocr_reader = None
device = "cpu"


def load_models():
    """Load BLIP, CLIP, and EasyOCR models into memory if dependencies exist."""
    global blip_processor, blip_model, clip_processor, clip_model, ocr_reader, device

    if not TORCH_AVAILABLE:
        logger.warning("Torch/Transformers not installed. Operating in explainable heuristic AI mode.")
        device = "cpu"
        return

    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")

        logger.info("Loading BLIP model (image captioning)...")
        blip_processor = BlipProcessor.from_pretrained(
            "Salesforce/blip-image-captioning-base",
            cache_dir=MODEL_CACHE,
        )
        blip_model = BlipForConditionalGeneration.from_pretrained(
            "Salesforce/blip-image-captioning-base",
            cache_dir=MODEL_CACHE,
        ).to(device)

        logger.info("Loading CLIP model (embeddings & matching)...")
        clip_processor = CLIPProcessor.from_pretrained(
            "openai/clip-vit-base-patch32",
            cache_dir=MODEL_CACHE,
        )
        clip_model = CLIPModel.from_pretrained(
            "openai/clip-vit-base-patch32",
            cache_dir=MODEL_CACHE,
        ).to(device)

        logger.info("All BLIP & CLIP models loaded successfully!")
    except Exception as e:
        logger.warning(f"Could not initialize BLIP/CLIP models ({e}). Falling back to feature embeddings.")

    if EASYOCR_AVAILABLE:
        try:
            logger.info("Loading EasyOCR engine for text recognition & brand disambiguation...")
            ocr_reader = easyocr.Reader(["en"], gpu=(device == "cuda"), verbose=False)
            logger.info("EasyOCR engine loaded successfully!")
        except Exception as e:
            logger.warning(f"Could not initialize EasyOCR ({e}). Operating without OCR.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup, cleanup on shutdown."""
    load_models()
    yield
    logger.info("Shutting down SafeKeep AI server...")


# ─── FastAPI App ──────────────────────────────────────────────────
app = FastAPI(
    title="SafeKeep Campus Lost & Found AI Server",
    description="Multimodal candidate ranking with BLIP captioning, CLIP embeddings, and secure Appwrite verification",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Schemas ────────────────────────────────────────────
class CaptionResponse(BaseModel):
    caption: str


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    caption: str


class MatchRequest(BaseModel):
    embedding_a: list[float]
    embedding_b: list[float]


class MatchResponse(BaseModel):
    similarity: float
    is_match: bool
    threshold: float


class BulkMatchRequest(BaseModel):
    query_embedding: list[float]
    candidate_embeddings: list[list[float]]
    candidate_ids: list[str]
    threshold: Optional[float] = None


class BulkMatchItem(BaseModel):
    item_id: str
    similarity: float


class BulkMatchResponse(BaseModel):
    matches: list[BulkMatchItem]
    threshold: float


class TextEmbeddingRequest(BaseModel):
    text: str


class TextEmbeddingResponse(BaseModel):
    embedding: list[float]


class FoundVerificationRequest(BaseModel):
    found_item_id: str
    prompt: str
    answer: str


class FoundForLostRequest(BaseModel):
    prompt: str
    answer: str


class VerifyAnswerRequest(BaseModel):
    expected: str
    provided: str


class ClaimAnswerRequest(BaseModel):
    answer: str


class MessageRequest(BaseModel):
    item_id: str
    receiver_id: str
    message: str


# ─── Heuristic Fallbacks (when Torch/CLIP is downloading or absent) ──
def heuristic_text_embedding(text: str, dim: int = 512) -> np.ndarray:
    """Deterministic hash embedding of text for testing/fallback."""
    vec = np.zeros(dim, dtype=np.float32)
    words = re.findall(r"[a-z0-9]+", text.lower())
    if not words:
        vec[0] = 1.0
        return vec
    for w in words:
        h = int(hashlib.md5(w.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 8) & 1) else -1.0
        vec[idx] += sign
    norm = np.linalg.norm(vec)
    return vec / (norm + 1e-8)


def heuristic_image_embedding(image: Image.Image, dim: int = 512) -> np.ndarray:
    """Deterministic color-histogram embedding of PIL image for fallback."""
    thumb = image.resize((32, 32)).convert("RGB")
    arr = np.asarray(thumb, dtype=np.float32) / 255.0
    r_hist, _ = np.histogram(arr[:, :, 0], bins=16, range=(0, 1))
    g_hist, _ = np.histogram(arr[:, :, 1], bins=16, range=(0, 1))
    b_hist, _ = np.histogram(arr[:, :, 2], bins=16, range=(0, 1))
    hist = np.concatenate([r_hist, g_hist, b_hist]).astype(np.float32)
    # Tile up to dim
    repeats = int(np.ceil(dim / len(hist)))
    vec = np.tile(hist, repeats)[:dim]
    return vec / (np.linalg.norm(vec) + 1e-8)


# ─── Helper Functions ─────────────────────────────────────────────
def read_image(file_bytes: bytes) -> Image.Image:
    """Read uploaded bytes into a PIL Image."""
    try:
        image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {e}")


def generate_caption(image: Image.Image, fallback_text: str = "") -> str:
    """Generate a natural-language caption using BLIP (or fallback)."""
    if blip_model and blip_processor and device:
        try:
            inputs = blip_processor(image, return_tensors="pt").to(device)
            with torch.no_grad():
                output = blip_model.generate(**inputs, max_new_tokens=80)
            caption = blip_processor.decode(output[0], skip_special_tokens=True)
            return caption
        except Exception as e:
            logger.warning(f"BLIP generation failed ({e}), using fallback caption")

    w, h = image.size
    return f"campus item photo ({w}x{h}) - {fallback_text or 'item'}"


def generate_image_embedding(image: Image.Image) -> np.ndarray:
    """Generate a CLIP image embedding (normalised)."""
    if clip_model and clip_processor and device:
        try:
            inputs = clip_processor(images=image, return_tensors="pt").to(device)
            with torch.no_grad():
                features = clip_model.get_image_features(**inputs)
            if hasattr(features, "pooler_output"):
                embedding = features.pooler_output.cpu().numpy().flatten()
            elif hasattr(features, "last_hidden_state"):
                embedding = features.last_hidden_state[:, 0, :].cpu().numpy().flatten()
            else:
                embedding = features.cpu().numpy().flatten()
            embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
            return embedding
        except Exception as e:
            logger.warning(f"CLIP image embedding failed ({e}), using fallback")

    return heuristic_image_embedding(image)


def generate_text_embedding(text: str) -> np.ndarray:
    """Generate a CLIP text embedding (normalised)."""
    if clip_model and clip_processor and device:
        try:
            inputs = clip_processor(text=[text], return_tensors="pt", padding=True).to(device)
            with torch.no_grad():
                features = clip_model.get_text_features(**inputs)
            if hasattr(features, "pooler_output"):
                embedding = features.pooler_output.cpu().numpy().flatten()
            elif hasattr(features, "last_hidden_state"):
                embedding = features.last_hidden_state[:, 0, :].cpu().numpy().flatten()
            else:
                embedding = features.cpu().numpy().flatten()
            embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
            return embedding
        except Exception as e:
            logger.warning(f"CLIP text embedding failed ({e}), using fallback")

    return heuristic_text_embedding(text)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b) + 1e-8
    return float(dot / norm)


def compute_text_semantic_similarity(t1: str, t2: str) -> float:
    """Compute semantic relation score between two text strings using text embeddings."""
    e1 = generate_text_embedding(t1)
    e2 = generate_text_embedding(t2)
    return cosine_similarity(e1, e2)


def text_similarity(*values: Optional[str]) -> float:
    """Jaccard similarity on keyword tokens for text alignment."""
    left = set(re.findall(r"[a-z0-9]{3,}", (values[0] or "").lower()))
    right = set(re.findall(r"[a-z0-9]{3,}", (values[1] or "").lower()))
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def combined_report_text(item: dict) -> str:
    return " ".join(str(item.get(key) or "") for key in ("title", "description", "ai_caption"))


KNOWN_BRANDS = [
    "OnePlus", "Apple", "Boat", "Noise", "Sony", "Samsung", "JBL", "Boult",
    "Realme", "Xiaomi", "Redmi", "Nothing", "CMF", "Sennheiser", "Anker",
    "Zebronics", "Skullcandy", "Bose", "Casio", "Dell", "HP", "Lenovo",
    "Asus", "Acer", "Logitech", "Fastrack", "Titan", "Wildcraft", "Nike", "Puma",
]


def extract_ocr_and_brands(image: Image.Image) -> tuple[str, list[str], Optional[str]]:
    """
    Extract visible printed text from an image via EasyOCR and identify matching brand names.
    Returns (raw_ocr_text, list_of_detected_brands, primary_brand).
    """
    raw_text = ""
    detected_brands = []

    if ocr_reader:
        try:
            arr = np.array(image.convert("RGB"))
            results = ocr_reader.readtext(arr)
            words = []
            for item in results:
                if len(item) >= 2:
                    t = str(item[1]).strip()
                    conf = float(item[2]) if len(item) >= 3 else 1.0
                    if conf > 0.25 and len(t) > 1:
                        words.append(t)
            raw_text = " ".join(words)
        except Exception as e:
            logger.warning(f"EasyOCR text extraction failed: {e}")
            raw_text = ""

    norm = raw_text.lower()
    for b in KNOWN_BRANDS:
        b_clean = b.lower()
        if b_clean == "oneplus" and ("oneplus" in norm or "one plus" in norm or "1+" in norm or "nord" in norm):
            if "OnePlus" not in detected_brands:
                detected_brands.append("OnePlus")
        elif b_clean == "apple" and ("apple" in norm or "airpod" in norm or "airpods" in norm or "designed by apple" in norm):
            if "Apple" not in detected_brands:
                detected_brands.append("Apple")
        elif re.search(r"\b" + re.escape(b_clean) + r"\b", norm):
            if b not in detected_brands:
                detected_brands.append(b)

    primary = detected_brands[0] if detected_brands else None
    return raw_text, detected_brands, primary


def extract_brand_from_text(text: Optional[str]) -> Optional[str]:
    """Identify brand tokens from title, description, or caption."""
    if not text:
        return None
    lower = text.lower()
    if "oneplus" in lower or "one plus" in lower or "1+" in lower or "nord buds" in lower:
        return "OnePlus"
    if "apple" in lower or "airpod" in lower or "airpods" in lower or "macbook" in lower or "ipad" in lower or "iphone" in lower:
        return "Apple"
    for b in KNOWN_BRANDS:
        if re.search(r"\b" + re.escape(b.lower()) + r"\b", lower):
            return b
    return None


def resolve_item_brand(item: dict, ocr_brand: Optional[str] = None) -> Optional[str]:
    """Retrieve verified brand from item attributes, OCR, title, or description."""
    if ocr_brand:
        return ocr_brand
    if item.get("brand"):
        return str(item["brand"])
    combined = f"{item.get('title', '')} {item.get('description', '')} {item.get('ai_caption', '')} {item.get('ocr_text', '')}"
    return extract_brand_from_text(combined)


def appwrite_ready():
    if not APPWRITE_ENDPOINT or not APPWRITE_PROJECT_ID or not APPWRITE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Appwrite server services are not configured. Check APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY.",
        )


def service_headers() -> dict:
    return {
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": APPWRITE_API_KEY,
        "Content-Type": "application/json",
    }


async def current_appwrite_user(authorization: Optional[str]) -> dict:
    """Validate an Appwrite JWT before accessing server-only collections."""
    appwrite_ready()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="A signed-in SafeKeep student session is required")
    token = authorization.split(" ", 1)[1]
    async with httpx.AsyncClient(timeout=15) as client:
        user_response = await client.get(
            f"{APPWRITE_ENDPOINT}/account",
            headers={"X-Appwrite-Project": APPWRITE_PROJECT_ID, "X-Appwrite-JWT": token},
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Your SafeKeep session has expired or is invalid")
        return user_response.json()


def document_url(collection_id: str, document_id: str = "") -> str:
    suffix = f"/documents/{document_id}" if document_id else "/documents"
    return f"{APPWRITE_ENDPOINT}/databases/{APPWRITE_DATABASE_ID}/collections/{collection_id}{suffix}"


async def appwrite_document(collection_id: str, document_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(document_url(collection_id, document_id), headers=service_headers())
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="SafeKeep record not found")
    return response.json()


def serialize_query(q: str) -> str:
    q = q.strip()
    if q.startswith("{") and q.endswith("}"):
        return q
    m_equal = re.match(r'equal\s*\(\s*["\']([^"\']+)["\']\s*,\s*\[(.*)\]\s*\)', q)
    if m_equal:
        attr = m_equal.group(1)
        raw_vals = m_equal.group(2)
        vals = [v.strip().strip('"').strip("'") for v in raw_vals.split(",") if v.strip()]
        return json.dumps({"method": "equal", "attribute": attr, "values": vals})
    m_limit = re.match(r'limit\s*\(\s*(\d+)\s*\)', q)
    if m_limit:
        return json.dumps({"method": "limit", "values": [int(m_limit.group(1))]})
    m_order = re.match(r'(orderDesc|orderAsc)\s*\(\s*["\']([^"\']+)["\']\s*\)', q)
    if m_order:
        method = m_order.group(1)
        attr = m_order.group(2)
        return json.dumps({"method": method, "attribute": attr})
    return q


async def appwrite_list(collection_id: str, queries: list[str]) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            document_url(collection_id),
            params=[("queries[]", serialize_query(query)) for query in queries],
            headers=service_headers(),
        )
    if response.status_code != 200:
        logger.error("Appwrite list failed: %s", response.text)
        raise HTTPException(status_code=502, detail="SafeKeep could not read protected records")
    return response.json().get("documents", [])


async def appwrite_create(collection_id: str, data: dict) -> dict:
    payload = {"documentId": str(uuid.uuid4()), "data": data, "permissions": []}
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(document_url(collection_id), headers=service_headers(), json=payload)
    if response.status_code not in (200, 201):
        logger.error("Appwrite create failed: %s", response.text)
        raise HTTPException(status_code=502, detail="SafeKeep could not save protected record")
    return response.json()


async def appwrite_update(collection_id: str, document_id: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.patch(
            document_url(collection_id, document_id),
            headers=service_headers(),
            json={"data": data},
        )
    if response.status_code != 200:
        logger.error("Appwrite update failed: %s", response.text)
        raise HTTPException(status_code=502, detail="SafeKeep could not update protected record")
    return response.json()


# ─── API Endpoints ────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check endpoint indicating model and Appwrite configuration status."""
    return {
        "status": "healthy",
        "device": str(device),
        "blip_loaded": blip_model is not None,
        "clip_loaded": clip_model is not None,
        "appwrite_configured": bool(APPWRITE_ENDPOINT and APPWRITE_PROJECT_ID and APPWRITE_API_KEY),
    }


@app.post("/caption", response_model=CaptionResponse)
async def caption_image(file: UploadFile = File(...)):
    """Generate a visual caption using BLIP."""
    file_bytes = await file.read()
    image = read_image(file_bytes)
    caption = generate_caption(image)
    return CaptionResponse(caption=caption)


@app.post("/embed", response_model=EmbeddingResponse)
async def embed_image(file: UploadFile = File(...)):
    """Generate CLIP visual embedding + BLIP caption for an image."""
    file_bytes = await file.read()
    image = read_image(file_bytes)
    caption = generate_caption(image)
    embedding = generate_image_embedding(image)
    return EmbeddingResponse(
        embedding=embedding.tolist(),
        caption=caption,
    )


@app.post("/embed-text", response_model=TextEmbeddingResponse)
async def embed_text(request: TextEmbeddingRequest):
    """Generate CLIP text embedding from description text."""
    embedding = generate_text_embedding(request.text)
    return TextEmbeddingResponse(embedding=embedding.tolist())


@app.post("/match", response_model=MatchResponse)
async def match_two_items(request: MatchRequest):
    """Compare two embeddings and return similarity score."""
    a = np.array(request.embedding_a)
    b = np.array(request.embedding_b)
    sim = cosine_similarity(a, b)
    return MatchResponse(
        similarity=round(sim, 4),
        is_match=sim >= MATCH_THRESHOLD,
        threshold=MATCH_THRESHOLD,
    )


@app.post("/match-bulk", response_model=BulkMatchResponse)
async def match_bulk(request: BulkMatchRequest):
    """Compare a query embedding against candidate vectors."""
    threshold = request.threshold or MATCH_THRESHOLD
    query = np.array(request.query_embedding)
    matches = []

    for cid, candidate in zip(request.candidate_ids, request.candidate_embeddings):
        candidate_arr = np.array(candidate)
        sim = cosine_similarity(query, candidate_arr)
        if sim >= threshold:
            matches.append(BulkMatchItem(item_id=cid, similarity=round(sim, 4)))

    matches.sort(key=lambda m: m.similarity, reverse=True)
    return BulkMatchResponse(matches=matches, threshold=threshold)


@app.post("/process-item")
async def process_item(
    file: UploadFile = File(...),
    item_type: str = Form(...),
    user_description: Optional[str] = Form(None),
):
    """
    Multimodal pipeline:
    1. EasyOCR extracts printed text and recognizes product brands.
    2. BLIP generates natural-language descriptive visual caption.
    3. CLIP encodes image into feature vector.
    4. CLIP encodes multimodal text (caption + description + OCR text + brand).
    5. Vectors are fused and normalised for downstream matching.
    """
    file_bytes = await file.read()
    image = read_image(file_bytes)

    # 1. OCR text extraction & brand recognition
    ocr_text, detected_brands, primary_brand = extract_ocr_and_brands(image)

    # If user provided description has brand, merge
    if not primary_brand and user_description:
        primary_brand = extract_brand_from_text(user_description)
    if primary_brand and primary_brand not in detected_brands:
        detected_brands.append(primary_brand)

    # 2. Visual captioning
    caption = generate_caption(image, fallback_text=user_description or "")
    if primary_brand and primary_brand.lower() not in caption.lower():
        caption = f"{caption} (Brand: {primary_brand})"

    # 3. Vision and Text Embeddings
    img_embedding = generate_image_embedding(image)

    # Enrich text vector with OCR text and detected brand
    combined_parts = [caption]
    if user_description:
        combined_parts.append(user_description)
    if ocr_text:
        combined_parts.append(f"Visible Text: {ocr_text}")
    if primary_brand:
        combined_parts.append(f"Brand: {primary_brand}")

    combined_text = ". ".join(combined_parts)
    text_embedding = generate_text_embedding(combined_text)

    # Weighted multimodal fusion (image dominant, text supplementary)
    fused = 0.85 * img_embedding + 0.15 * text_embedding
    fused = fused / (np.linalg.norm(fused) + 1e-8)

    return {
        "caption": caption,
        "embedding": fused.tolist(),
        "image_embedding": img_embedding.tolist(),
        "text_embedding": text_embedding.tolist(),
        "item_type": item_type,
        "ocr_text": ocr_text,
        "detected_brands": detected_brands,
        "primary_brand": primary_brand or "",
    }


@app.post("/found-verifications")
async def create_found_verification(
    request: FoundVerificationRequest, authorization: Optional[str] = Header(default=None)
):
    """Store salted PBKDF2 hash of secret answer in protected collection."""
    user = await current_appwrite_user(authorization)
    found = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, request.found_item_id)
    if found.get("type") != "found" or found.get("user_id") != user.get("$id"):
        raise HTTPException(status_code=403, detail="Only the finder can secure this report")
    if len(request.prompt.strip()) < 4 or len(request.answer.strip()) < 1:
        raise HTTPException(status_code=400, detail="Provide a meaningful question and answer")

    salt = secrets.token_hex(16)
    clean_ans = request.answer.strip()
    answer_hash = hashlib.pbkdf2_hmac(
        "sha256", clean_ans.lower().encode(), salt.encode(), 310_000
    ).hex()
    b64_ans = base64.b64encode(clean_ans.encode()).decode()
    answer_payload = f"{answer_hash}|{b64_ans}"
    if len(answer_payload) > 256:
        answer_payload = answer_hash

    try:
        await appwrite_document(APPWRITE_VERIFICATIONS_COLLECTION_ID, request.found_item_id)
        await appwrite_update(
            APPWRITE_VERIFICATIONS_COLLECTION_ID,
            request.found_item_id,
            {"prompt": request.prompt.strip(), "answer_hash": answer_payload, "salt": salt},
        )
    except HTTPException as error:
        if error.status_code != 404:
            raise
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                document_url(APPWRITE_VERIFICATIONS_COLLECTION_ID),
                headers=service_headers(),
                json={
                    "documentId": request.found_item_id,
                    "data": {
                        "found_item_id": request.found_item_id,
                        "prompt": request.prompt.strip(),
                        "answer_hash": answer_payload,
                        "salt": salt,
                    },
                    "permissions": [],
                },
            )
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail="SafeKeep could not secure verification details")

    return {"secured": True}


def stored_embedding(item: dict) -> Optional[list[float]]:
    value = item.get("embedding")
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else None
        except json.JSONDecodeError:
            return None
    return None


def location_compatibility(loc1: Optional[str], loc2: Optional[str]) -> float:
    if not loc1 or not loc2:
        return 0.0
    l1 = loc1.strip().lower()
    l2 = loc2.strip().lower()
    if l1 in l2 or l2 in l1:
        return 1.0
    words1 = set(l1.split())
    words2 = set(l2.split())
    if words1 & words2:
        return 0.8
    import difflib
    ratio = difflib.SequenceMatcher(None, l1, l2).ratio()
    if ratio > 0.7:
        return 1.0
    if ratio > 0.5:
        return 0.5
    return 0.0


async def ensure_item_embedding(item: dict) -> list[float]:
    emb = stored_embedding(item)
    if emb is not None and len(emb) > 0:
        return emb

    image_path = item.get("image_path")
    if image_path:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                res = await client.get(
                    f"{APPWRITE_ENDPOINT}/storage/buckets/{APPWRITE_BUCKET_ID}/files/{image_path}/download",
                    headers={"X-Appwrite-Project": APPWRITE_PROJECT_ID, "X-Appwrite-Key": APPWRITE_API_KEY},
                )
                if res.status_code == 200:
                    img = read_image(res.content)
                    caption = generate_caption(img, fallback_text=item.get("description", ""))
                    img_emb = generate_image_embedding(img)
                    user_desc = item.get("description", "")
                    combined_text = f"{caption}. {user_desc}" if user_desc else caption
                    txt_emb = generate_text_embedding(combined_text)
                    fused = 0.85 * img_emb + 0.15 * txt_emb
                    fused = fused / (np.linalg.norm(fused) + 1e-8)
                    emb_list = fused.tolist()
                    try:
                        await appwrite_update(APPWRITE_ITEMS_COLLECTION_ID, item["$id"], {
                            "embedding": json.dumps(emb_list),
                            "ai_caption": caption,
                        })
                    except Exception as e:
                        logger.warning(f"Could not save backfilled embedding for {item.get('$id')}: {e}")
                    return emb_list
        except Exception as e:
            logger.warning(f"Failed to download image to self-heal embedding: {e}")

    # Fallback to text embedding
    txt = combined_report_text(item)
    txt_emb = generate_text_embedding(txt)
    return txt_emb.tolist()


@app.post("/rank-report/{report_id}")
async def rank_report(report_id: str, authorization: Optional[str] = Header(default=None)):
    """
    Algorithm 2: Multi-modal Ranking of candidates without exposing private found reports.
    Handles both newly submitted Lost items and newly submitted Found items.
    """
    if authorization and authorization == f"Bearer {APPWRITE_API_KEY}":
        user = {"$id": "server-admin"}
        target = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, report_id)
    else:
        user = await current_appwrite_user(authorization)
        target = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, report_id)
        if target.get("user_id") != user.get("$id"):
            raise HTTPException(status_code=403, detail="You can only rank your own report")

    target_type = target.get("type")
    candidate_type = "found" if target_type == "lost" else "lost"
    candidates = await appwrite_list(
        APPWRITE_ITEMS_COLLECTION_ID,
        [f'equal("type", ["{candidate_type}"])', 'equal("status", ["open"])', "limit(200)"],
    )

    created = 0
    for candidate in candidates:
        lost_doc = target if target_type == "lost" else candidate
        found_doc = candidate if target_type == "lost" else target

        # 1. Cosine similarity of CLIP embeddings (self-heals missing embeddings)
        image_score = 0.0
        left = await ensure_item_embedding(lost_doc)
        right = await ensure_item_embedding(found_doc)
        if left and right:
            try:
                image_score = max(
                    0.0,
                    cosine_similarity(np.asarray(left, dtype=float), np.asarray(right, dtype=float)),
                )
            except (TypeError, ValueError):
                image_score = 0.0

        # 2. Textual overlap of title, description, caption
        copy_score = text_similarity(combined_report_text(lost_doc), combined_report_text(found_doc))

        # 3. Location compatibility with fuzzy and keyword matching
        loc_score = location_compatibility(lost_doc.get("location"), found_doc.get("location"))

        # Composite score
        score = 0.70 * image_score + 0.20 * copy_score + 0.10 * loc_score

        # 4. Brand Specificity & Disqualification (prevents showing AirPods for OnePlus buds)
        lost_brand = resolve_item_brand(lost_doc)
        found_brand = resolve_item_brand(found_doc)

        if lost_brand and found_brand:
            if lost_brand.lower() != found_brand.lower():
                logger.info(
                    f"Brand mismatch conflict: Lost={lost_brand} vs Found={found_brand}. Rejecting candidate match."
                )
                continue
            else:
                score = min(1.0, score + 0.15)
        elif lost_brand or found_brand:
            active_brand = (lost_brand or found_brand).lower()
            other_text = combined_report_text(found_doc if lost_brand else lost_doc).lower()
            other_brand = extract_brand_from_text(other_text)
            if other_brand and other_brand.lower() != active_brand:
                logger.info(
                    f"Contradictory brand token detected ({active_brand} vs {other_brand}). Rejecting candidate."
                )
                continue

        if score < MATCH_THRESHOLD:
            continue

        existing = await appwrite_list(
            APPWRITE_MATCHES_COLLECTION_ID,
            [
                f'equal("lost_item_id", ["{lost_doc["$id"]}"])',
                f'equal("found_item_id", ["{found_doc["$id"]}"])',
                "limit(1)",
            ],
        )

        payload = {
            "lost_item_id": lost_doc["$id"],
            "found_item_id": found_doc["$id"],
            "lost_owner_id": lost_doc["user_id"],
            "similarity_score": round(min(score, 1.0), 4),
            "status": "suggested",
        }

        if existing:
            await appwrite_update(APPWRITE_MATCHES_COLLECTION_ID, existing[0]["$id"], payload)
        else:
            await appwrite_create(APPWRITE_MATCHES_COLLECTION_ID, payload)
        created += 1

    return {"report_id": report_id, "candidate_count": created, "threshold": MATCH_THRESHOLD}


@app.get("/matches/{lost_item_id}")
async def list_matches(lost_item_id: str, authorization: Optional[str] = Header(default=None)):
    """List candidate matches for a lost item owned by current user."""
    lost = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, lost_item_id)
    if authorization and authorization == f"Bearer {APPWRITE_API_KEY}":
        user = {"$id": lost.get("user_id")}
    else:
        user = await current_appwrite_user(authorization)
    if lost.get("user_id") != user.get("$id"):
        raise HTTPException(status_code=403, detail="This match list is private")

    matches = await appwrite_list(
        APPWRITE_MATCHES_COLLECTION_ID,
        [f'equal("lost_item_id", ["{lost_item_id}"])', 'orderDesc("similarity_score")', "limit(50)"],
    )
    return [
        {
            "id": record["$id"],
            "lost_item_id": record["lost_item_id"],
            "found_item_id": record["found_item_id"],
            "similarity_score": float(record["similarity_score"]),
            "status": record["status"],
            "created_at": record["$createdAt"],
        }
        for record in matches
    ]


@app.post("/claims/{match_id}/start")
async def start_claim(match_id: str, authorization: Optional[str] = Header(default=None)):
    """Retrieve finder's challenge prompt for a candidate match."""
    user = await current_appwrite_user(authorization)
    match = await appwrite_document(APPWRITE_MATCHES_COLLECTION_ID, match_id)
    if match.get("lost_owner_id") != user.get("$id") or match.get("status") not in ("suggested", "claimed"):
        raise HTTPException(status_code=403, detail="This claim challenge is not available")

    verification = await appwrite_document(APPWRITE_VERIFICATIONS_COLLECTION_ID, match["found_item_id"])
    existing = await appwrite_list(
        APPWRITE_CLAIMS_COLLECTION_ID,
        [f'equal("match_id", ["{match_id}"])', f'equal("claimant_id", ["{user["$id"]}"])', "limit(1)"],
    )

    if existing:
        claim = existing[0]
        if claim.get("status") == "rejected":
            claim = await appwrite_update(
                APPWRITE_CLAIMS_COLLECTION_ID, claim["$id"], {"status": "pending", "attempts": 0}
            )
    else:
        claim = await appwrite_create(
            APPWRITE_CLAIMS_COLLECTION_ID,
            {
                "match_id": match_id,
                "claimant_id": user["$id"],
                "found_item_id": match["found_item_id"],
                "status": "pending",
                "attempts": 0,
            },
        )

    if match.get("status") == "suggested":
        await appwrite_update(APPWRITE_MATCHES_COLLECTION_ID, match_id, {"status": "claimed"})

    return {"claim_id": claim["$id"], "prompt": verification["prompt"]}


@app.post("/claims/{claim_id}/verify")
async def verify_claim(
    claim_id: str, request: ClaimAnswerRequest, authorization: Optional[str] = Header(default=None)
):
    """
    Algorithm 3: Claim Verification.
    Compares candidate's answer against stored salted PBKDF2 hash.
    Max 3 attempts before locking out the claim.
    """
    user = await current_appwrite_user(authorization)
    claim = await appwrite_document(APPWRITE_CLAIMS_COLLECTION_ID, claim_id)
    if claim.get("claimant_id") != user.get("$id") or claim.get("status") != "pending":
        raise HTTPException(status_code=403, detail="This claim is not available")

    verification = await appwrite_document(APPWRITE_VERIFICATIONS_COLLECTION_ID, claim["found_item_id"])
    stored_payload = verification.get("answer_hash", "")
    stored_hash = stored_payload
    expected_answer = ""
    if "|" in stored_payload:
        parts = stored_payload.split("|", 1)
        stored_hash = parts[0]
        try:
            expected_answer = base64.b64decode(parts[1].encode()).decode()
        except Exception:
            expected_answer = ""

    attempts = int(claim.get("attempts", 0)) + 1
    is_verified = False

    # 1. Smart fuzzy and semantic relation check (model + fuzzy string logic)
    if expected_answer:
        is_verified, score, match_type = verify_answer_relation(
            expected_answer,
            request.answer,
            semantic_sim_fn=compute_text_semantic_similarity,
        )
        if is_verified:
            logger.info(f"Claim {claim_id} verified via {match_type} (score: {score:.2f})")

    # 2. Cryptographic PBKDF2 hash comparison fallback
    if not is_verified:
        candidate_hash = hashlib.pbkdf2_hmac(
            "sha256",
            request.answer.strip().lower().encode(),
            verification["salt"].encode(),
            310_000,
        ).hex()
        if hmac.compare_digest(candidate_hash, stored_hash):
            is_verified = True
            logger.info(f"Claim {claim_id} verified via exact cryptographic hash")

    if is_verified:
        found = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, claim["found_item_id"])
        await appwrite_update(APPWRITE_CLAIMS_COLLECTION_ID, claim_id, {"status": "verified", "attempts": attempts})
        await appwrite_update(APPWRITE_MATCHES_COLLECTION_ID, claim["match_id"], {"status": "verified"})
        await appwrite_update(APPWRITE_ITEMS_COLLECTION_ID, found["$id"], {"status": "claimed"})
        return {
            "verified": True,
            "attempts_remaining": max(0, 3 - attempts),
            "found_item_id": found["$id"],
            "finder_id": found["user_id"],
            "finder_name": found.get("user_name", "Item Finder"),
        }

    rejected = attempts >= 3
    await appwrite_update(
        APPWRITE_CLAIMS_COLLECTION_ID,
        claim_id,
        {"status": "rejected" if rejected else "pending", "attempts": attempts},
    )
    if rejected:
        await appwrite_update(APPWRITE_MATCHES_COLLECTION_ID, claim["match_id"], {"status": "rejected"})

    return {"verified": False, "attempts_remaining": max(0, 3 - attempts)}


async def verify_user_in_pair(item_id: str, user_id: str, other_user_id: str) -> None:
    """Ensure messaging is only permitted between verified claimant and finder."""
    found = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, item_id)
    claims = await appwrite_list(
        APPWRITE_CLAIMS_COLLECTION_ID,
        [f'equal("found_item_id", ["{item_id}"])', 'equal("status", ["verified"])', "limit(50)"],
    )
    finder_id = found.get("user_id")
    valid = any(
        (claim.get("claimant_id") == user_id and finder_id == other_user_id)
        or (claim.get("claimant_id") == other_user_id and finder_id == user_id)
        for claim in claims
    )
    if not valid:
        raise HTTPException(status_code=403, detail="Messaging unlocks only after ownership verification")


@app.get("/messages/{item_id}/{other_user_id}")
async def list_messages(item_id: str, other_user_id: str, authorization: Optional[str] = Header(default=None)):
    user = await current_appwrite_user(authorization)
    await verify_user_in_pair(item_id, user["$id"], other_user_id)
    records = await appwrite_list(
        APPWRITE_MESSAGES_COLLECTION_ID,
        [f'equal("item_id", ["{item_id}"])', 'orderAsc("$createdAt")', "limit(200)"],
    )
    return [
        {
            "id": record["$id"],
            "sender_id": record["sender_id"],
            "message": record["message"],
            "created_at": record["$createdAt"],
        }
        for record in records
        if {record.get("sender_id"), record.get("receiver_id")} == {user["$id"], other_user_id}
    ]


@app.post("/messages")
async def send_message(request: MessageRequest, authorization: Optional[str] = Header(default=None)):
    user = await current_appwrite_user(authorization)
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="A message cannot be empty")
    await verify_user_in_pair(request.item_id, user["$id"], request.receiver_id)
    await appwrite_create(
        APPWRITE_MESSAGES_COLLECTION_ID,
        {
            "item_id": request.item_id,
            "sender_id": user["$id"],
            "sender_name": user.get("name") or user.get("email", "Student"),
            "receiver_id": request.receiver_id,
            "message": request.message.strip(),
        },
    )
    return {"sent": True}


@app.post("/found-for-lost/{lost_item_id}")
async def report_found_for_lost(
    lost_item_id: str,
    request: FoundForLostRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    Directly reports finding a specific lost item from the feed.
    Inherits title, location, image and description without re-asking the finder.
    Sets the secret ownership question and connects a 1.0 similarity candidate match.
    """
    user = await current_appwrite_user(authorization)
    lost = await appwrite_document(APPWRITE_ITEMS_COLLECTION_ID, lost_item_id)
    if lost.get("type") != "lost":
        raise HTTPException(status_code=400, detail="Target item is not a lost report")
    if lost.get("user_id") == user.get("$id"):
        raise HTTPException(status_code=400, detail="You cannot claim to have found your own lost item")
    if len(request.prompt.strip()) < 4 or len(request.answer.strip()) < 1:
        raise HTTPException(status_code=400, detail="Provide a meaningful secret question and expected answer")

    # 1. Create found report inheriting details from the lost item
    found_payload = {
        "user_id": user["$id"],
        "user_name": user.get("name") or user.get("email", "Campus Student"),
        "type": "found",
        "title": lost.get("title", "Found Item"),
        "description": f"Found item corresponding to lost report \"{lost.get('title')}\".",
        "location": lost.get("location", ""),
        "occurred_at": lost.get("occurred_at", ""),
        "image_path": lost.get("image_path", ""),
        "ai_caption": lost.get("ai_caption", ""),
        "embedding": lost.get("embedding", "[]"),
        "status": "open",
    }
    found_item = await appwrite_create(APPWRITE_ITEMS_COLLECTION_ID, found_payload)

    # 2. Store the verification challenge with base64 payload for smart fuzzy matching
    salt = secrets.token_hex(16)
    clean_ans = request.answer.strip()
    answer_hash = hashlib.pbkdf2_hmac(
        "sha256", clean_ans.lower().encode(), salt.encode(), 310_000
    ).hex()
    b64_ans = base64.b64encode(clean_ans.encode()).decode()
    answer_payload = f"{answer_hash}|{b64_ans}"
    if len(answer_payload) > 256:
        answer_payload = answer_hash

    verif_doc = {
        "found_item_id": found_item["$id"],
        "prompt": request.prompt.strip(),
        "answer_hash": answer_payload,
        "salt": salt,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        await client.post(
            document_url(APPWRITE_VERIFICATIONS_COLLECTION_ID),
            headers=service_headers(),
            json={"documentId": found_item["$id"], "data": verif_doc, "permissions": []},
        )

    # 3. Create direct match (1.0 similarity)
    match_payload = {
        "lost_item_id": lost["$id"],
        "found_item_id": found_item["$id"],
        "lost_owner_id": lost["user_id"],
        "similarity_score": 1.0,
        "status": "suggested",
    }
    match = await appwrite_create(APPWRITE_MATCHES_COLLECTION_ID, match_payload)

    return {
        "foundItem": {
            "id": found_item["$id"],
            "type": "found",
            "title": found_item["title"],
            "description": found_item["description"],
            "location": found_item["location"],
            "status": "open",
            "created_at": found_item.get("$createdAt", ""),
            "user_id": user["$id"],
            "user_name": found_payload["user_name"],
        },
        "match": {
            "id": match["$id"],
            "lost_item_id": lost["$id"],
            "found_item_id": found_item["$id"],
            "similarity_score": 1.0,
            "status": "suggested",
            "created_at": match.get("$createdAt", ""),
            "lost_item_title": lost.get("title", ""),
            "lost_item_location": lost.get("location", ""),
        },
    }


@app.post("/verify-answer")
async def verify_answer_endpoint(request: VerifyAnswerRequest):
    """Fuzzy and semantic relation verification endpoint for challenge answers."""
    ok, score, method = verify_answer_relation(
        request.expected,
        request.provided,
        semantic_sim_fn=compute_text_semantic_similarity,
    )
    return {"verified": ok, "similarity_score": score, "method": method}


# ─── Run ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
