# SafeKeep Appwrite Setup & Architecture Guide

SafeKeep uses **Appwrite** as the open-source backend-as-a-service (replacing Supabase) for student authentication, document storage, image bucket management, and permission controls.

Its multimodal candidate ranking, challenge-response verification, and verified-only messaging are coordinated by the FastAPI service via a server-only Appwrite API key.

---

## 1. Quick Automated Setup (Recommended)

SafeKeep provides an automated script that connects to your Appwrite instance and provisions the complete database, collections, attributes, and storage bucket in one command:

1. Create a project in [Appwrite Cloud](https://cloud.appwrite.io) or your self-hosted Appwrite.
2. In your Appwrite Project settings:
   - Add a **Web Platform** for hostname `localhost` and `127.0.0.1`.
   - Enable **Email/Password** under Authentication settings.
   - Under **Overview > API Keys**, create a server API key with `databases.read`, `databases.write`, `collections.read`, `collections.write`, `attributes.read`, `attributes.write`, `indexes.read`, `indexes.write`, and `buckets.read`, `buckets.write` scopes.
3. Paste the project endpoint, project ID, and API key into `ai_server/.env` and `web/.env.local`:
   ```bash
   cp web/.env.example web/.env.local
   cp ai_server/.env.example ai_server/.env
   ```
4. Run the automated provisioner:
   ```bash
   python3 scripts/setup-appwrite.py
   ```
The script will automatically create the database `safekeep`, the storage bucket `item_images`, and all five required collections with their attributes and document security settings!

---

## 2. Manual Console Setup (Alternative)

If you prefer to configure Appwrite manually via the web console, follow these steps:

### A. Storage Bucket: `item_images`
1. Navigate to **Storage** in the Appwrite Console.
2. Click **Create Bucket**:
   - Bucket ID: `item_images`
   - Name: `Item Images`
3. In **Settings**:
   - Turn **File Security** ON (enables document-level permissions).
   - Under **Permissions**, grant the **Users** (`users`) role **Create** access. (Read/update permissions are assigned per-file by the client: lost photos are accessible to authenticated campus users; found photos remain finder-only).

### B. Database: `safekeep`
1. Navigate to **Databases** and click **Create Database**.
   - Database ID: `safekeep`
   - Name: `SafeKeep Campus Database`

### C. Client Collection: `items`
Turn **Document Security** ON. Grant **Users** (`users`) the **Create** permission.

Attributes:
| Attribute | Type | Size / Values | Required |
| --- | --- | --- | --- |
| `user_id` | String | 36 | Yes |
| `user_name` | String | 120 | No |
| `type` | Enum | `lost`, `found` | Yes |
| `title` | String | 120 | Yes |
| `description` | String | 2000 | Yes |
| `location` | String | 160 | Yes |
| `occurred_at` | String | 40 | No |
| `image_path` | String | 36 | Yes |
| `ai_caption` | String | 1000 | No |
| `embedding` | String | 20000 | No |
| `status` | Enum | `open`, `claimed`, `returned` | Yes |

Indexes:
- `type_status`: Key on `type`, `status`
- `user_created`: Key on `user_id`, `$createdAt`
- `title_search`: Fulltext on `title`

---

### D. Protected Server Collections (FastAPI Server-Only)
For the four collections below, **do not** grant any permissions to the `Users` role. Only the FastAPI service accesses these using its server API key.

#### 1. `verifications`
Stores salted cryptographic PBKDF2 hashes of private ownership answers.
| Attribute | Type | Size | Required |
| --- | --- | --- | --- |
| `found_item_id` | String | 36 | Yes |
| `prompt` | String | 240 | Yes |
| `answer_hash` | String | 256 | Yes |
| `salt` | String | 64 | Yes |

#### 2. `matches`
Stores potential candidate matches ranked by the AI service.
| Attribute | Type | Size / Values | Required |
| --- | --- | --- | --- |
| `lost_item_id` | String | 36 | Yes |
| `found_item_id` | String | 36 | Yes |
| `lost_owner_id` | String | 36 | Yes |
| `similarity_score` | Float | Min 0.0, Max 1.0 | Yes |
| `status` | Enum | `suggested`, `claimed`, `verified`, `rejected` | Yes |

#### 3. `claims`
Tracks claim attempts against a match candidate (locks out after 3 failed attempts).
| Attribute | Type | Size / Values | Required |
| --- | --- | --- | --- |
| `match_id` | String | 36 | Yes |
| `claimant_id` | String | 36 | Yes |
| `found_item_id` | String | 36 | Yes |
| `status` | Enum | `pending`, `verified`, `rejected` | Yes |
| `attempts` | Integer | Min 0, Max 10 | Yes |

#### 4. `messages`
Encrypted conversation messages between verified claimant and finder.
| Attribute | Type | Size | Required |
| --- | --- | --- | --- |
| `item_id` | String | 36 | Yes |
| `sender_id` | String | 36 | Yes |
| `sender_name` | String | 120 | No |
| `receiver_id` | String | 36 | Yes |
| `message` | String | 2000 | Yes |

---

## 3. Privacy-First Workflow Verification

1. **Found Reports are Hidden**: When a finder reports an item, it is stored with finder-only read permissions in Appwrite. It never appears on the campus home feed.
2. **Cryptographic Salted Hashing**: The finder's expected answer is salted and hashed using `hashlib.pbkdf2_hmac` with 310,000 SHA-256 iterations. The raw answer is never stored in plain text and never sent to any client.
3. **Decoupled Similarity & Ownership**: High CLIP/BLIP multimodal similarity only indicates a potential candidate match. Ownership is only proven when the claimant provides the exact private detail matching the hash.
4. **Verified Handover Channel**: Once verified, a private chat channel unlocks where finder and owner coordinate physical return (e.g. at Central Library desk or Campus Security), and the item is marked as `returned`.
