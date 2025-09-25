# src/backend/recommender/app.py
import os, io, base64, time
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

import firebase_admin
from firebase_admin import credentials, firestore, storage

from model import RecommenderModel
import os, sys
if os.name == "nt":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    

# -------------------- Flask --------------------
app = Flask(__name__)
CORS(app)

# -------------------- Firebase Admin --------------------
# Service account JSON must exist in this folder
SERVICE_JSON = os.getenv("FIREBASE_SERVICE_JSON", "serviceAccountKey.json")

# Your Storage bucket; you used the firebasestorage.app bucket earlier
BUCKET_NAME = os.getenv("GCS_BUCKET", "furnitune-64458.firebasestorage.app")

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_JSON)
    firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})

db = firestore.client()
bucket = storage.bucket()
print(f" Using Storage bucket: {bucket.name}")

# -------------------- Model --------------------
recommender = RecommenderModel()

# -------------------- Data Loading --------------------
def pick_first_image_url(slug: str) -> str | None:
    """
    Find one image in GCS under products/<slug>/ and return a signed URL.
    """
    for blob in bucket.list_blobs(prefix=f"products/{slug}/"):
        name = blob.name.lower()
        if name.endswith((".png", ".jpg", ".jpeg", ".webp")):
            return blob.generate_signed_url(version="v4", expiration=7*24*3600, method="GET")
    return None

def looks_like_image_url(u: str) -> bool:
    if not u or not u.startswith("http"):
        return False
    # Block Firebase *metadata* links that return JSON instead of image bytes
    if "firebasestorage.googleapis.com/v0/b/" in u and "alt=media" not in u:
        return False
    return True

# ======== ADDED: helper to convert Firebase metadata links to signed, viewable URLs ========
from urllib.parse import unquote

def to_viewable_image(u: str) -> str | None:
    """
    If `u` is a Firebase Storage *metadata* URL (no ?alt=media), turn it into a
    short-lived signed URL for direct image loading. Otherwise return it as-is.
    """
    if not u or not u.startswith("http"):
        return None

    # Already looks like a direct image URL (common extensions)
    lower = u.lower()
    if lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")) and "alt=media" in lower or "googleapis.com" not in lower:
        return u

    # Firebase Storage metadata URL pattern → sign it using the bucket in the URL
    if "firebasestorage.googleapis.com" in u and "/v0/b/" in u and "/o/" in u and "alt=media" not in u:
        try:
            after_b = u.split("/v0/b/")[1]
            bucket_name = after_b.split("/o/")[0]
            object_enc = after_b.split("/o/")[1].split("?")[0]
            object_path = unquote(object_enc)  # decode %2F, etc.

            blob = storage.bucket(bucket_name).blob(object_path)
            return blob.generate_signed_url(version="v4", expiration=3600, method="GET")
        except Exception as e:
            print("[image-url] signing failed:", e)
            return None

    return u
# ======== /ADDED ========


def load_products():
    """
    Load active products from Firestore; attach one HTTPS image per product.
    Accepts either an 'images' array (already HTTPS) or a 'slug' to look up in GCS.
    """
    docs = db.collection("products").where("active", "==", True).stream()

    products, ids, urls = [], [], []
    for d in docs:
        p = d.to_dict()
        p["id"] = d.id

        url = None
        # Prefer first HTTPS image if doc already has it
        if p.get("images"):
            first = str(p["images"][0])
            if first.startswith("http"):
                url = first
                # ADDED: coerce Firebase metadata links → signed, viewable URL
                url = to_viewable_image(url) or url

        # Else try to derive from slug in GCS
        if not url and p.get("slug"):
            url = pick_first_image_url(str(p["slug"]))

        if not url:
            print(f"no image for {d.id} (slug={p.get('slug')})")
            continue

        p["images"] = [url]
        products.append(p)
        ids.append(d.id)
        urls.append(url)

    print(f" Loaded {len(products)} products with valid images")
    return products, ids, urls

# -------------------- Build index once --------------------
all_products, product_ids, product_images = load_products()
recommender.build_index(product_images, product_ids)

def sanity_check():
    """Self-query sanity: use one catalog image and verify top-1 == itself."""
    if not recommender.index or not all_products:
        print("[SANITY] skipped (no index or no products)")
        return
    import requests
    import random
    i = random.randrange(0, len(all_products))
    pid = all_products[i]["id"]
    url = all_products[i]["images"][0]

    try:
        r = requests.get(url, timeout=15); r.raise_for_status()
        pil = Image.open(io.BytesIO(r.content)).convert("RGB")
        q = recommender.embed_image(pil)
        ids, sims = recommender.search_with_scores([q], k=3)
        ok = (ids[0] == pid)
        print(f"[SANITY] self-query top-1 matches itself? {ok}  => {ids[:3]}  (expected {pid})")
    except Exception as e:
        print(f"[SANITY] failed: {e}")

sanity_check()

# -------------------- Diagnostics --------------------
# src/backend/recommender/app.py

# -------------------- Diagnostics --------------------
@app.get("/reco/health")
@app.get("/reco/debug/health")
def reco_health():
    """Return evidence that we're using CLIP + FAISS, and index stats."""
    import torch, faiss, transformers
    info = {
        "clip_model": getattr(recommender.model.config, "name_or_path", "unknown"),
        "device": recommender.device,
        "is_clip": recommender.model.__class__.__name__,
        "processor": recommender.processor.__class__.__name__,
        "faiss_index_type": type(recommender.index).__name__ if recommender.index else None,
        "faiss_ntotal": int(recommender.index.ntotal) if recommender.index else 0,
        "num_product_ids": len(recommender.product_ids),
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
        "faiss_version": getattr(faiss, "__version__", "unknown"),
    }
    return info, 200


# -------------------- Recommend --------------------
@app.post("/reco/recommend")
def recommend():
    """
    Body:
    {
      "image_b64": "...",  // optional
      "text": "modern gray sofa", // optional
      "k": 3,
      "debug": 1
    }
    """
    if not recommender.index:
        return jsonify({"results": [], "error": "index not built"}), 200

    body = request.get_json(force=True) or {}
    k = int(body.get("k", 3))
    debug = str(body.get("debug", "0")) == "1"

    t0 = time.time()
    q_vecs = []

    text = (body.get("text") or "").strip()
    if text:
        q_vecs.append(recommender.embed_text(text))  # CLIP text

    img_b64 = body.get("image_b64")
    if img_b64:
        raw = base64.b64decode(img_b64)
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        q_vecs.append(recommender.embed_image(pil))  # CLIP image

    if not q_vecs:
        return jsonify({"results": [], "note": "no query provided"}), 200

    t1 = time.time()
    ids, scores = recommender.search_with_scores(q_vecs, k)  # FAISS
    t2 = time.time()

    results = [p for p in all_products if p["id"] in ids]

    payload = {"results": results}
    if debug:
        payload["faiss_debug"] = {
            "ids": ids,
            "scores": [float(s) for s in scores],
            "clip_embed_ms": round((t1 - t0) * 1000, 2),
            "faiss_search_ms": round((t2 - t1) * 1000, 2),
            "index_type": type(recommender.index).__name__,
        }

    print(f"[RECO] CLIP embed {round((t1-t0)*1000)}ms, FAISS search {round((t2-t1)*1000)}ms, top={ids}")
    return jsonify(payload), 200


if __name__ == "__main__":
    # Run dev server
    app.run(host="0.0.0.0", port=5000, debug=True)
