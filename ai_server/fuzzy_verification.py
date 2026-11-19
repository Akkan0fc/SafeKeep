"""
SafeKeep — Fuzzy & Semantic Relation Verification Engine
=========================================================
Checks ownership challenge response against expected answer.
Provides robust verification allowing for:
- Case variations and punctuation differences
- Additional explanatory words ("it has a", "on the front")
- Spelling mistakes / typos (Levenshtein distance & normalized ratio)
- Compact space-free matches ("spiderman" vs "spider-man")
- Token set containment & token coverage
- Character bigram Dice similarity
- CLIP multimodal text embedding cosine similarity (semantic model check)
"""

import re
from typing import Optional, Callable, Tuple

STOP_WORDS = {
    "a", "an", "the", "it", "its", "is", "are", "was", "were", "has", "have", "had",
    "with", "on", "in", "at", "to", "for", "of", "and", "or", "my", "your", "this",
    "that", "there", "some", "one", "side", "back", "front", "attached", "like", "i",
    "think", "got", "color", "coloured", "colored"
}


def clean_text(text: str) -> str:
    """Normalize text by lowercasing and stripping non-alphanumeric characters."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein distance between two strings."""
    if s1 == s2:
        return 0
    if not s1:
        return len(s2)
    if not s2:
        return len(s1)
    if len(s1) < len(s2):
        s1, s2 = s2, s1
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def token_similarity(w1: str, w2: str) -> float:
    """Compute normalized word similarity with prefix/suffix tolerance."""
    if w1 == w2:
        return 1.0
    if len(w1) >= 4 and len(w2) >= 4:
        if w1.startswith(w2) or w2.startswith(w1):
            return 0.92
        if w1.endswith(w2) or w2.endswith(w1):
            return 0.90
    max_len = max(len(w1), len(w2))
    if max_len == 0:
        return 1.0
    return 1.0 - (levenshtein_distance(w1, w2) / max_len)


def extract_key_tokens(text: str) -> list[str]:
    """Extract significant keywords, discarding stop words."""
    cleaned = clean_text(text)
    tokens = [t for t in cleaned.split() if t]
    filtered = [t for t in tokens if t not in STOP_WORDS]
    return filtered if filtered else tokens


def dice_bigram_similarity(s1: str, s2: str) -> float:
    """Calculate character bigram Dice coefficient."""
    if s1 == s2:
        return 1.0
    if len(s1) < 2 or len(s2) < 2:
        return 0.0

    def get_bigrams(s: str) -> dict[str, int]:
        d: dict[str, int] = {}
        for i in range(len(s) - 1):
            pair = s[i : i + 2]
            d[pair] = d.get(pair, 0) + 1
        return d

    bg1 = get_bigrams(s1)
    bg2 = get_bigrams(s2)
    intersection = sum(min(count, bg2.get(k, 0)) for k, count in bg1.items())
    total = (len(s1) - 1) + (len(s2) - 1)
    return (2.0 * intersection) / total if total > 0 else 0.0


def verify_answer_relation(
    expected: str,
    provided: str,
    semantic_sim_fn: Optional[Callable[[str, str], float]] = None,
) -> Tuple[bool, float, str]:
    """
    Evaluate whether provided answer matches expected answer.
    Returns (verified, confidence_score, method).
    """
    exp_clean = clean_text(expected)
    prov_clean = clean_text(provided)

    if not exp_clean or not prov_clean:
        return False, 0.0, "empty"

    # 1. Exact match
    if exp_clean == prov_clean:
        return True, 1.0, "exact"

    # 2. Substring containment
    if exp_clean in prov_clean:
        return True, 1.0, "contains_expected"

    if len(prov_clean) >= 3 and prov_clean in exp_clean:
        return True, 0.92, "contained_in_expected"

    # 3. Compact space-free match ("spider-man" vs "spiderman")
    compact_exp = exp_clean.replace(" ", "")
    compact_prov = prov_clean.replace(" ", "")
    if compact_exp == compact_prov:
        return True, 0.98, "compact_exact"
    if compact_exp in compact_prov or (len(compact_prov) >= 4 and compact_prov in compact_exp):
        return True, 0.92, "compact_contains"

    # 4. Token coverage with fuzzy Levenshtein match
    exp_tokens = extract_key_tokens(exp_clean)
    prov_tokens = extract_key_tokens(prov_clean)

    matched = 0
    for et in exp_tokens:
        best_sim = max((token_similarity(et, pt) for pt in prov_tokens), default=0.0)
        # 0.75 allows 1-2 character typos (e.g. carabener -> carabiner)
        if best_sim >= 0.75:
            matched += 1

    coverage = matched / len(exp_tokens) if exp_tokens else 0.0
    if len(exp_tokens) == 1:
        if matched == 1:
            return True, coverage, "token_coverage"
    elif len(exp_tokens) == 2:
        if matched == 2:
            return True, coverage, "token_coverage"
    else:
        if matched >= 2 and coverage >= 0.60:
            return True, coverage, "token_coverage"

    # 5. Character bigram Dice similarity
    bg_sim = dice_bigram_similarity(exp_clean, prov_clean)
    if bg_sim >= 0.60:
        return True, bg_sim, "bigram_similarity"

    # 6. Overall whole-phrase Levenshtein ratio
    max_len = max(len(exp_clean), len(prov_clean))
    phrase_sim = 1.0 - (levenshtein_distance(exp_clean, prov_clean) / max_len)
    if phrase_sim >= 0.70:
        return True, phrase_sim, "phrase_levenshtein"

    # 7. Semantic Model Check (CLIP text embedding cosine similarity)
    if semantic_sim_fn is not None:
        try:
            sem_score = semantic_sim_fn(expected, provided)
            # Very high semantic similarity alone (prevents generic category noun matches)
            if sem_score >= 0.90:
                return True, float(sem_score), "semantic_clip_model"
            # Combined moderate fuzzy + high semantic
            base_fuzzy = max(coverage, bg_sim, phrase_sim)
            combined = 0.5 * base_fuzzy + 0.5 * sem_score
            if combined >= 0.75 and base_fuzzy >= 0.40:
                return True, float(combined), "hybrid_fuzzy_clip"
        except Exception:
            pass

    best_score = max(coverage, bg_sim, phrase_sim)
    return False, best_score, "insufficient_match"
