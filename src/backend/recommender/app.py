from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

import os, re, base64, io, json, tempfile, urllib.parse, random
from typing import Dict, List, Optional

import numpy as np
from PIL import Image
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import firestore, storage
import requests

from google import genai

from model import ArtifactIndex, ClipQueryEncoder, FaissSearcher

# -----------------------------------------------------------------------------
# Credentials init
# -----------------------------------------------------------------------------
def _ensure_gcp_credentials():
    gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if gac and os.path.exists(gac):
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

_ensure_gcp_credentials()

# -----------------------------------------------------------------------------
# ENV
# -----------------------------------------------------------------------------
PROJECT_ID = os.getenv("GCP_PROJECT") or os.getenv("FIREBASE_PROJECT") or ""
GCS_BUCKET = os.getenv("GCS_BUCKET", "")
SIGNED_URL_EXPIRY = int(os.getenv("SIGNED_URL_EXPIRY", "3600"))
PORT = int(os.getenv("PORT", "5000"))
CORS_ALLOWED_ORIGIN = os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

# 🚨 INCREASED THRESHOLD: The catalog must be a VERY GOOD visual match (> 0.55), 
# otherwise it clears the catalog and forces the Custom AI to take over!
SUITABILITY_THRESHOLD = 0.55

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

app = Flask(__name__)
CORS(app, origins=[CORS_ALLOWED_ORIGIN], supports_credentials=False)

db = firestore.Client(project=PROJECT_ID or None)
gcs = storage.Client(project=PROJECT_ID or None)

# -----------------------------------------------------------------------------
# AI Interior Designer Logic
# -----------------------------------------------------------------------------
def analyze_with_gemini(img_b64, text, f_type, size_pref, color_pref, min_b, max_b):
    try:
        if not gemini_client:
            return {"room_analysis": "🚨 DEBUG: No API Key found!", "custom_concepts": []}

        contents = []

        prompt = f"""
        You are an expert interior designer. A customer is looking for a specific furniture piece that is CURRENTLY OUT OF STOCK in our ready-to-ship catalog, or doesn't match their room's aesthetic perfectly.
        Analyze their room photo (if provided) and design 2 CUSTOM concepts that perfectly meet their requirements.
        
        Customer Requirements:
        - Type: {f_type or 'Not specified'}
        - Size: {size_pref or 'Not specified'}
        - Color: {color_pref or 'Not specified'}
        - Budget: {min_b or 0} to {max_b or 'Any'} PHP

        Output ONLY valid JSON. Structure exactly like this:
        {{
          "room_analysis": "A warm paragraph explaining that while the exact item isn't in our standard catalog, you've custom-designed these pieces to perfectly match their space.",
          "custom_concepts": [
            {{
              "title": "Short Creative Name of Furniture",
              "description": "Why this specific piece looks amazing in their room.",
              "category": "The category (e.g., Sofa, Bed)",
              "suggested_color": "The recommended color."
            }}
          ]
        }}
        """
        
        if img_b64:
            img_data = base64.b64decode(img_b64)
            img = Image.open(io.BytesIO(img_data))
            contents.append(img)

        contents.append(prompt)

        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents
        )
        
        resp_text = response.text.strip()
        
        start_idx = resp_text.find('{')
        end_idx = resp_text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            json_str = resp_text[start_idx:end_idx+1]
        else:
            json_str = resp_text
            
        parsed = json.loads(json_str)

        for concept in parsed.get("custom_concepts", []):
            c_title = re.sub(r'[^a-zA-Z\s]', '', str(concept.get("title", f_type or "Furniture"))).strip()
            c_color = re.sub(r'[^a-zA-Z\s]', '', str(concept.get("suggested_color", color_pref or "Modern"))).strip()
            
            c_color_short = " ".join(c_color.split()[:2])
            c_title_short = " ".join(c_title.split()[:3])
            
            img_prompt_str = f"beautiful {c_color_short} {c_title_short} furniture isolated"
            encoded_prompt = urllib.parse.quote(img_prompt_str)
            seed = random.randint(1, 999999)
            
            # 🚨 Added model=flux to generate the image in 2 seconds so it NEVER times out! 🚨
            concept["image_url"] = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=800&height=600&model=flux&nologo=true&seed={seed}"

        return parsed
    except Exception as e:
        print(f"Gemini Error: {e}")
        return {"room_analysis": f"🚨 DEBUG ERROR: {str(e)}", "custom_concepts": []}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _is_valid_bucket(name: str) -> bool:
    return bool(name and re.match(r"^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", name))

def _sign_gs_url(gs_url: str, expiry_seconds: int = SIGNED_URL_EXPIRY) -> Optional[str]:
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

def _norm_token(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

def _collect_size_tokens(meta: dict) -> List[str]:
    tokens: List[str] = []
    sizes = meta.get("sizeOptions") or []
    if isinstance(sizes, list):
        for s in sizes:
            if isinstance(s, dict):
                for key in ("label", "name", "id"):
                    v = s.get(key)
                    if isinstance(v, str):
                        tokens.append(v.lower())
            elif isinstance(s, str):
                tokens.append(s.lower())
    sc = meta.get("seatCount")
    if sc:
        try:
            n = int(sc)
            tokens.append(f"{n} seater")
            tokens.append(f"{n}-seater")
        except Exception:
            pass
    return tokens

def _collect_color_tokens(meta: dict) -> List[str]:
    tokens: List[str] = []
    colors = meta.get("colorOptions") or []
    if isinstance(colors, list):
        for c in colors:
            if isinstance(c, dict):
                for key in ("label", "name", "id"):
                    v = c.get(key)
                    if isinstance(v, str):
                        tokens.append(v.lower())
            elif isinstance(c, str):
                tokens.append(c.lower())
    tags = meta.get("tags") or []
    if isinstance(tags, list):
        tokens.extend(str(t).lower() for t in tags)
    return tokens

def _size_match_score(meta: dict, pref: str) -> float:
    if not pref:
        return 0.0
    pref_norm = _norm_token(pref)
    if not pref_norm:
        return 0.0
    for t in _collect_size_tokens(meta):
        if _norm_token(t) == pref_norm:
            return 1.0
    return 0.0

def _color_match_score(meta: dict, pref: str) -> float:
    if not pref:
        return 0.0
    pref_norm = _norm_token(pref)
    if not pref_norm:
        return 0.0
    for t in _collect_color_tokens(meta):
        if _norm_token(t) == pref_norm:
            return 1.0
    return 0.0

def _hydrate_images_from_firestore(pid: str, color_pref: Optional[str] = None, size_pref: Optional[str] = None) -> List[str]:
    try:
        snap = db.collection("products").document(pid).get()
        if not snap.exists:
            return []

        d = snap.to_dict() or {}
        candidates: List[str] = []

        ibo = d.get("imagesByOption")
        if isinstance(ibo, dict) and (color_pref or size_pref):
            color_key = None
            if color_pref:
                want = _norm_token(color_pref)
                for ck in ibo.keys():
                    if _norm_token(ck) == want:
                        color_key = ck
                        break

            if color_key and isinstance(ibo.get(color_key), dict):
                size_map = ibo[color_key]
                size_key = None
                if size_pref:
                    want_s = _norm_token(size_pref)
                    for sk in size_map.keys():
                        if _norm_token(sk) == want_s:
                            size_key = sk
                            break

                if size_key and isinstance(size_map.get(size_key), list):
                    for u in size_map[size_key]:
                        if isinstance(u, str):
                            candidates.append(u)
                else:
                    for arr in size_map.values():
                        if isinstance(arr, list):
                            candidates.extend([u for u in arr if isinstance(u, str)])

        if isinstance(ibo, dict):
            for color_map in ibo.values():
                if isinstance(color_map, dict):
                    for arr in color_map.values():
                        if isinstance(arr, list):
                            candidates.extend([u for u in arr if isinstance(u, str)])

        for k in ("thumbnail","imageUrl","image","defaultImagePath","heroImage"):
            v = d.get(k)
            if isinstance(v, str):
                candidates.append(v)
        imgs = d.get("images")
        if isinstance(imgs, list):
            candidates.extend([u for u in imgs if isinstance(u, str)])

        out, seen = [], set()
        for u in candidates:
            https = _coerce_https(u)
            if https and https not in seen:
                seen.add(https)
                out.append(https)
        return out
    except Exception:
        return []

def _ensure_item_avg_lab(it: dict) -> dict:
    return it

art = ArtifactIndex(os.path.join(os.path.dirname(__file__), "artifacts"))
art.load()
encoder = ClipQueryEncoder()
searcher = FaissSearcher(art)
CATALOG: Dict[str, dict] = {m["id"]: m for m in art.mapping_list}

def _to_ui(items: List[dict], size_pref: Optional[str] = None, color_pref: Optional[str] = None) -> List[dict]:
    out: List[dict] = []
    for it in items:
        pid = it.get("id")
        title = it.get("name") or it.get("title") or pid
        price = it.get("basePrice") or it.get("price") or 0

        images = _normalize_images(it)
        if pid:
            fs_imgs = _hydrate_images_from_firestore(pid, color_pref=color_pref, size_pref=size_pref)
            if fs_imgs:
                images = fs_imgs

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

@app.route("/health", methods=["GET"])
def plain_health():
    return jsonify({"status": "ok", "project": PROJECT_ID or "<unset>"}), 200

@app.route("/reco/health", methods=["GET"])
@app.route("/reco/debug/health", methods=["GET"])
def debug_health():
    return jsonify({"status": "ok", "project": PROJECT_ID or "<unset>"}), 200

@app.post("/reco/recommend")   
@app.post("/recommend")        
def recommend():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    text            = (data.get("text") or "").strip()
    img_b64         = data.get("image_b64")
    k               = int(data.get("k") or 24)
    f_type          = (data.get("type") or "").strip()
    size_pref       = (data.get("size") or "").strip()
    color_pref      = (data.get("color") or "").strip()
    force_ai        = bool(data.get("force_ai", False))
    
    # 100% VISUAL AI
    w_image = 1.0 
    w_text  = 0.0

    try:
        min_budget = float(data.get("min_budget")) if data.get("min_budget") else None
        max_budget = float(data.get("max_budget")) if data.get("max_budget") else None
    except ValueError:
        min_budget, max_budget = None, None

    qvec = encoder.embed_query(text=text, image_b64=img_b64, w_image=w_image, w_text=w_text)
    rows, scores = searcher.search(qvec, k=max(k, 60))

    ranked: List[dict] = []
    for row, sc in zip(rows, scores):
        it = dict(art.row_to_item(row))
        pid = it.get("id")
        if not pid: continue
        if f_type and not _type_matches(it, f_type): continue
        
        price = float(it.get("basePrice") or it.get("price") or 0)
        if min_budget is not None and price < min_budget: continue
        if max_budget is not None and price > max_budget: continue
            
        if color_pref and color_pref.lower() != "none":
            if _color_match_score(it, color_pref) == 0.0: continue
                
        if size_pref and size_pref.lower() != "none":
            if _size_match_score(it, size_pref) == 0.0: continue

        it["score"] = float(sc)
        ranked.append(it)

    ranked.sort(key=lambda x: x["score"], reverse=True)
    top_matches = ranked[:k]
    
    force_ai_fallback = force_ai

    # 🚨 SUITABILITY CHECK WITH NEW HIGH THRESHOLD 🚨
    if img_b64 and len(top_matches) > 0:
        best_score = top_matches[0]["score"]
        print(f"DEBUG: Best visual match score is {best_score}")
        if best_score < SUITABILITY_THRESHOLD:
            print("DEBUG: Visual match too poor. Forcing AI Fallback.")
            force_ai_fallback = True

    if force_ai_fallback:
        payload_items = []
    else:
        payload_items = _to_ui(top_matches, size_pref=size_pref, color_pref=color_pref)

    ai_designer_data = None
    if len(payload_items) == 0 and GEMINI_API_KEY:
        print("DEBUG: Triggering Gemini AI Designer.")
        ai_designer_data = analyze_with_gemini(
            img_b64=img_b64, text=text, f_type=f_type, size_pref=size_pref, color_pref=color_pref, min_b=min_budget, max_b=max_budget
        )

    return jsonify({
        "items": payload_items,
        "products": payload_items,
        "results": payload_items,
        "ai_designer": ai_designer_data,
        "from": "catalog" if len(payload_items) > 0 else "ai_fallback",
        "count": len(payload_items),
        "fallback": None,
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)