
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

import os, re, base64, io, json, tempfile
from typing import Dict, List, Optional

import numpy as np
from PIL import Image
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import firestore, storage
import requests

from model import ArtifactIndex, ClipQueryEncoder, FaissSearcher

# -----------------------------------------------------------------------------
# Credentials init (supports file path OR raw JSON env var)
# -----------------------------------------------------------------------------
def _ensure_gcp_credentials():
    """
    Prefer GOOGLE_APPLICATION_CREDENTIALS (file path).
    If FIREBASE_ADMIN_JSON is set, write it to a temp file and point GAC to it.
    Do NOT hardcode repo paths.
    """
    gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if gac and os.path.exists(gac):
        # File path provided and exists – good to go
        return

    raw = os.getenv("FIREBASE_ADMIN_JSON")
    if raw:
        try:
            data = json.loads(raw)
            fd, p = tempfile.mkstemp(prefix="svcacct_", suffix=".json")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = p
            return
        except Exception:
            pass
    # else: rely on default ADC (unlikely on Render). No raise here.

_ensure_gcp_credentials()

# -----------------------------------------------------------------------------
# ENV
# -----------------------------------------------------------------------------
PROJECT_ID = os.getenv("GCP_PROJECT") or os.getenv("FIREBASE_PROJECT") or ""
GCS_BUCKET = os.getenv("GCS_BUCKET", "")
SIGNED_URL_EXPIRY = int(os.getenv("SIGNED_URL_EXPIRY", "3600"))
PORT = int(os.getenv("PORT", "5000"))
BOOST_PER_MATCH = float(os.getenv("BOOST_PER_MATCH", "0.18"))
CORS_ALLOWED_ORIGIN = os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

# -----------------------------------------------------------------------------
# App + Clients
# -----------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, origins=[CORS_ALLOWED_ORIGIN], supports_credentials=False)

# Use Application Default Credentials resolved above
db = firestore.Client(project=PROJECT_ID or None)
gcs = storage.Client(project=PROJECT_ID or None)

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _is_valid_bucket(name: str) -> bool:
    return bool(name and re.match(r"^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", name))

def _sign_gs_url(gs_url: str, expiry_seconds: int = SIGNED_URL_EXPIRY) -> Optional[str]:
    """gs://bucket/path -> signed https (v4)."""
    try:
        if not isinstance(gs_url, str) or not gs_url.startswith("gs://"):
            return None
        if gs_url.endswith("/.keep") or "/.keep" in gs_url:
            return None
        rest = gs_url.split("gs://", 1)[1]
        bkt, path = rest.split("/", 1)
        if not _is_valid_bucket(bkt):
            return None
        blob = gcs.bucket(bkt).blob(path)
        return blob.generate_signed_url(version="v4", expiration=expiry_seconds, method="GET")
    except Exception:
        return None

def _coerce_https(u: Optional[str]) -> Optional[str]:
    """Return https from gs:// or http(s) string; skip placeholders."""
    if not isinstance(u, str) or not u:
        return None
    if u.endswith("/.keep") or "/.keep" in u:
        return None
    if u.startswith("http"):
        return u
    if u.startswith("gs://"):
        return _sign_gs_url(u)
    return None

def _normalize_images(item: dict) -> List[str]:
    candidates: List[str] = []
    imgs = item.get("images")
    if isinstance(imgs, list):
        candidates.extend([u for u in imgs if isinstance(u, str)])
    for k in ("thumbnail", "imageUrl", "image", "defaultImagePath", "heroImage"):
        v = item.get(k)
        if isinstance(v, str):
            candidates.append(v)
    ibo = item.get("imagesByOption")
    if isinstance(ibo, dict):
        for sizes in ibo.values():
            if isinstance(sizes, dict):
                for arr in sizes.values():
                    if isinstance(arr, list):
                        candidates.extend([u for u in arr if isinstance(u, str)])
    out: List[str] = []
    seen = set()
    for u in candidates:
        https = _coerce_https(u)
        if https and https not in seen:
            seen.add(https)
            out.append(https)
    return out

def _normalize(s: Optional[str]) -> str:
    return (s or "").strip().lower()

def _norm_any(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        v = " ".join([str(x) for x in v])
    return str(v).strip().lower()

def _type_matches(item: dict, f_type: str) -> bool:
    if not f_type:
        return True
    t = _normalize(f_type)
    dep  = _norm_any(item.get("departmentSlug"))
    cat  = _norm_any(item.get("categorySlug"))
    pid  = _norm_any(item.get("id"))
    name = _norm_any(item.get("name") or item.get("title"))
    for field in (dep, cat, pid, name):
        if t and t in field:
            return True
    aliases = {
        "bed": ["bedroom", "-bed", " bed"],
        "sofa": ["sofa", " couch", "-sofa"],
        "chair": ["chair", "-chair"],
        "table": ["table", "-table", "dining"],
        "bench": ["bench", "-bench"],
        "sectional": ["sectional", "-sectional"],
        "ottoman": ["ottoman", "-ottoman"],
    }
    for token in aliases.get(t, []):
        if token in dep or token in cat or token in pid or token in name:
            return True
    return False

# ---- Firestore hydration (images) -------------------------------------------
def _hydrate_images_from_firestore(pid: str) -> List[str]:
    """If mapping lacks images, pull from Firestore and sign to https."""
    try:
        snap = db.collection("products").document(pid).get()
        if not snap.exists:
            return []
        d = snap.to_dict() or {}
        candidates = []
        for k in ("thumbnail","imageUrl","image","defaultImagePath","heroImage"):
            v = d.get(k)
            if isinstance(v, str):
                candidates.append(v)
        imgs = d.get("images")
        if isinstance(imgs, list):
            candidates.extend([u for u in imgs if isinstance(u, str)])
        ibo = d.get("imagesByOption")
        if isinstance(ibo, dict):
            for sizes in ibo.values():
                if isinstance(sizes, dict):
                    for arr in sizes.values():
                        if isinstance(arr, list):
                            candidates.extend([u for u in arr if isinstance(u, str)])
        out, seen = [], set()
        for u in candidates:
            https = _coerce_https(u)
            if https and https not in seen:
                seen.add(https); out.append(https)
        return out
    except Exception:
        return []

# ---- Color helpers ----------------------------------------------------------
def _room_avg_lab_from_b64(b64: str):
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("LAB")
        arr = np.asarray(img.resize((96, 96)), dtype=np.float32)
        return [float(arr[:, :, 0].mean()), float(arr[:, :, 1].mean()), float(arr[:, :, 2].mean())]
    except Exception:
        return None

def _delta_e_lab(lab1, lab2):
    return float(np.linalg.norm(np.array(lab1, dtype=np.float32) - np.array(lab2, dtype=np.float32)))

def _rerank_by_color(items: List[dict], room_b64: Optional[str], weight: float = 0.35, mode: str = "match"):
    if not room_b64 or not items:
        return items, None
    room_lab = _room_avg_lab_from_b64(room_b64)
    if not room_lab:
        return items, None
    out: List[dict] = []
    for it in items:
        it2 = {**it}
        lab = it.get("avg_lab") or it.get("metadata", {}).get("avg_lab")
        if lab:
            d = _delta_e_lab(room_lab, lab)
            if mode == "match":
                sim = float(np.exp(-d / 20.0))
            else:
                sim = float(np.tanh(d / 60.0))
            boost = weight * sim
            it2["color_deltaE"] = d
            it2["color_boost"] = boost
            it2["score"] = it["score"] + boost
        else:
            it2["color_deltaE"] = None
            it2["color_boost"] = 0.0
        out.append(it2)
    return out, room_lab

# ---- Lazy avg_lab computation -----------------------------------------------
_avg_lab_cache: Dict[str, List[float]] = {}

def _compute_avg_lab_from_url(url: str) -> Optional[List[float]]:
    try:
        b = requests.get(url, timeout=10).content
        img = Image.open(io.BytesIO(b)).convert("LAB")
        arr = np.asarray(img.resize((96, 96)), dtype=np.float32)
        return [float(arr[:, :, 0].mean()), float(arr[:, :, 1].mean()), float(arr[:, :, 2].mean())]
    except Exception:
        return None

def _ensure_item_avg_lab(it: dict) -> dict:
    if it.get("avg_lab"):
        return it
    pid = it.get("id")
    urls = _normalize_images(it)
    if not urls and pid:
        urls = _hydrate_images_from_firestore(pid)
    for u in urls:
        if pid in _avg_lab_cache:
            it["avg_lab"] = _avg_lab_cache[pid]; return it
        lab = _compute_avg_lab_from_url(u)
        if lab:
            _avg_lab_cache[pid] = lab
            it["avg_lab"] = lab
            return it
    return it

# -----------------------------------------------------------------------------
# Artifacts & index
# -----------------------------------------------------------------------------
art = ArtifactIndex(os.path.join(os.path.dirname(__file__), "artifacts"))
art.load()
encoder = ClipQueryEncoder()
searcher = FaissSearcher(art)
CATALOG: Dict[str, dict] = {m["id"]: m for m in art.mapping_list}

# -----------------------------------------------------------------------------
# Flags cache
# -----------------------------------------------------------------------------
def _load_flags_cache() -> Dict[str, Dict[str, bool]]:
    flags: Dict[str, Dict[str, bool]] = {}
    for snap in db.collection("products").where("active", "==", True).stream():
        pid = snap.id
        doc = snap.to_dict() or {}
        flags[pid] = {field: bool(doc.get(field)) for field in ADDITIONAL_TO_FIELD.values()}
    return flags

# -----------------------------------------------------------------------------
# Additionals mapping
# -----------------------------------------------------------------------------
ADDITIONAL_TO_FIELD: Dict[str, str] = {
    "Cushion": "hasCushions",
    "With armrest": "hasArmrest",
    "Footrest": "hasFootrest",
    "Cabinets": "hasCabinets",
    "Pull out Bed": "hasPullOutBed",
    "Glass on top": "hasGlassTop",
    "Padded foam on top": "hasPaddedFoam",
    "With storage": "hasStorage",
    "Throw Pillow": "hasThrowPillow",
    "Decorative Tray": "hasDecorativeTray",
    # Aliases / legacy
    "Cushions": "hasCushions",
    "Pillows": "hasCushions",
    "With or without armrest": "hasArmrest",
    "Armrest": "hasArmrest",
    "Pull-out Bed": "hasPullOutBed",
}

def _extract_additionals(data: dict, text: str) -> List[str]:
    addl = []
    if isinstance(data.get("additionals"), list):
        addl.extend([a for a in data["additionals"] if isinstance(a, str)])
    t = (text or "").lower()
    if "armrest" in t:
        addl.append("With armrest")
    if "cushion" in t or "cushions" in t or "pillow" in t:
        addl.append("Cushion")
    if "no additional" in t or "none" in t:
        addl.append("None")
    seen = set()
    out = []
    for a in addl:
        key = a.strip()
        if key and key not in seen:
            seen.add(key); out.append(key)
    return out

def _map_additionals_to_fields(additionals_in: List[str]) -> List[str]:
    fields: List[str] = []
    for a in additionals_in:
        key = ADDITIONAL_TO_FIELD.get(a) or ADDITIONAL_TO_FIELD.get(a.strip().title())
        if key:
            fields.append(key)
    return fields

def _to_ui(items: List[dict]) -> List[dict]:
    out: List[dict] = []
    for it in items:
        pid = it.get("id")
        title = it.get("name") or it.get("title") or pid
        price = it.get("basePrice") or it.get("price") or 0
        images = _normalize_images(it)
        if not images and pid:
            images = _hydrate_images_from_firestore(pid)
        img = images[0] if images else ""
        out.append({
            **it,
            "id": pid, "slug": pid,
            "name": title, "title": title,
            "imageUrl": img, "image": img, "thumbnail": img, "primaryImage": img,
            "images": images,
            "basePrice": price, "price": price,
        })
    return out

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@app.get("/health")
def plain_health():
    return jsonify({"ok": art.size() > 0, "project": PROJECT_ID or "<unset>"}), (200 if art.size() > 0 else 500)

@app.get("/reco/debug/health")
def health():
    return jsonify({
        "ok": art.size() > 0,
        "count": len(CATALOG),
        "index": art.size(),
        "project": PROJECT_ID or "<unset>",
    }), (200 if art.size() > 0 else 500)

@app.get("/reco/debug/colors")
def debug_colors():
    total = len(art.mapping_list)
    with_lab = sum(1 for m in art.mapping_list if m.get("avg_lab"))
    return jsonify({"total": total, "with_avg_lab": with_lab, "ratio": with_lab / max(1, total)})

@app.get("/reco/debug/item/<pid>")
def debug_item(pid):
    doc = db.collection("products").document(pid).get()
    flags = {}
    if doc.exists:
        d = doc.to_dict() or {}
        flags = {k: bool(d.get(k)) for k in ADDITIONAL_TO_FIELD.values()}
    meta = next((m for m in art.mapping_list if m.get("id") == pid), None)
    return jsonify({
        "id": pid,
        "flags": flags,
        "avg_lab": (meta or {}).get("avg_lab"),
        "image": (meta or {}).get("image"),
    })

@app.post("/reco/recommend")
def recommend():
    """
    Accepts JSON:
      {
        k?: int=24,
        text?: str,
        image_b64?: str | null,
        type?: str,
        additionals?: [str],
        strict?: bool,
        w_image?: float=0.7,
        w_text?: float=0.3,
        color_weight?: float=0.35,
        color_mode?: "match"|"contrast"
      }
    """
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    text            = (data.get("text") or "").strip()
    img_b64         = data.get("image_b64")
    k               = int(data.get("k") or 24)
    f_type          = (data.get("type") or "").strip()
    additionals_in  = _extract_additionals(data, text)
    w_image         = float(data.get("w_image", 0.7))
    w_text          = float(data.get("w_text", 0.3))
    color_weight    = float(data.get("color_weight", 0.35))
    color_mode      = str(data.get("color_mode", "match")).strip().lower()

    # Handle "None" → no filters, non-strict
    if any(a.strip().lower() == "none" for a in additionals_in):
        additionals_in = []
        strict_mode = False
    else:
        strict_mode = bool(data.get("strict", True if additionals_in else False))

    fields_wanted = _map_additionals_to_fields(additionals_in)
    if fields_wanted:
        strict_mode = True

    flags_cache = _load_flags_cache()

    # 1) Embed query
    qvec = encoder.embed_query(text=text, image_b64=img_b64, w_image=w_image, w_text=w_text)

    # 2) Search
    rows, scores = searcher.search(qvec, k=max(k, 60))

    faiss_top_rows   = rows[:k]
    faiss_top_scores = [float(s) for s in scores[:k]]

    # 3) map + type filter
    ranked: List[dict] = []
    for row, sc in zip(rows, scores):
        it = dict(art.row_to_item(row))
        pid = it.get("id")
        if not pid:
            continue
        if f_type and not _type_matches(it, f_type):
            continue
        it["score"] = float(sc)
        ranked.append(it)

    # 4) additionals strict/soft
    def pass_all_flags(item: dict) -> bool:
        if not fields_wanted:
            return True
        item_flags = flags_cache.get(item["id"], {})
        return all(item_flags.get(f) for f in fields_wanted)

    def soft_boost(items: List[dict]) -> List[dict]:
        if not fields_wanted:
            return items
        out = []
        for it in items:
            item_flags = flags_cache.get(it["id"], {})
            matches = sum(1 for f in fields_wanted if item_flags.get(f))
            it2 = {**it}
            it2["score"] = it["score"] + matches * BOOST_PER_MATCH
            out.append(it2)
        return out

    fallback_reason = None

    if fields_wanted and strict_mode:
        strict_items = [it for it in ranked if pass_all_flags(it)]
        if strict_items:
            ranked = strict_items
        else:
            fallback_reason = "no_strict_additional_match"
            related_soft = soft_boost(ranked)
            related_soft.sort(key=lambda x: x["score"], reverse=True)
            related_soft = related_soft[:k]
            return jsonify({
                "items": [],
                "products": [],
                "results": [],
                "related": _to_ui(related_soft),
                "from": "catalog",
                "count": 0,
                "fallback": fallback_reason,
                "debug": {
                    "received_additionals": additionals_in,
                    "fields_wanted": fields_wanted,
                    "strict": True,
                    "after_strict_count": 0,
                    "faiss_top_rows": faiss_top_rows,
                    "faiss_top_scores": faiss_top_scores,
                    "w_image": w_image,
                    "w_text": w_text,
                    "color_mode": color_mode,
                    "color_weight": color_weight,
                },
            })
    else:
        ranked = soft_boost(ranked)

    # Ensure items have avg_lab (lazy) BEFORE color
    ranked = [_ensure_item_avg_lab(it) for it in ranked]

    # 4.5) color rerank
    room_lab_used = None
    if img_b64:
        ranked, room_lab_used = _rerank_by_color(ranked, img_b64, weight=color_weight, mode=color_mode)

    # 5) sort + cap
    ranked.sort(key=lambda x: x["score"], reverse=True)
    ranked = ranked[:k]

    # 6) normalize for UI (with image hydration fallback)
    payload_items = _to_ui(ranked)

    return jsonify({
        "items": payload_items,
        "products": payload_items,
        "results": payload_items,
        "from": "catalog",
        "count": len(payload_items),
        "fallback": fallback_reason,
        "debug": {
            "received_additionals": additionals_in,
            "fields_wanted": fields_wanted,
            "strict": bool(fields_wanted) if additionals_in else False,
            "after_strict_count": len(payload_items),
            "faiss_top_rows": faiss_top_rows,
            "faiss_top_scores": faiss_top_scores,
            "w_image": w_image,
            "w_text": w_text,
            "color_mode": color_mode,
            "color_weight": color_weight,
            "room_avg_lab": room_lab_used,
            "items_with_avg_lab": sum(1 for it in ranked if it.get("avg_lab")),
            "top_item_deltaE": payload_items[0].get("color_deltaE") if payload_items else None,
            "top_item_boost": payload_items[0].get("color_boost") if payload_items else None,
        },
    })

# Optional: self-check
@app.get("/reco/debug/selfcheck")
def selfcheck():
    try:
        k = int(request.args.get("k", 5))
        sample = int(request.args.get("n", 50))
    except Exception:
        k, sample = 5, 50

    hits = 0
    tried = 0
    examples = []

    for m in art.mapping_list[:sample]:
        img = m.get("image")
        if not img:
            continue
        img_https = _coerce_https(img)
        if not img_https:
            continue
        try:
            b = requests.get(img_https, timeout=10).content
        except Exception:
            continue
        b64 = base64.b64encode(b).decode("utf-8")
        q = encoder.embed_query(text="", image_b64=b64)
        rows, scores = searcher.search(q, k=k)
        tried += 1
        top_row = rows[0] if rows else -1
        top_id = art.row_to_item(top_row).get("id") if top_row >= 0 else None
        hit = (top_id == m["id"])
        hits += int(hit)
        if len(examples) < 10:
            examples.append({
                "query_id": m["id"],
                "top_id": top_id,
                "hit": hit,
                "score": float(scores[0]) if scores else None
            })

    return jsonify({
        "tested": tried,
        "r_at_1": hits / max(tried, 1),
        "examples": examples
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
