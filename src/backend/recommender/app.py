from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

import os, re, base64, io, json, tempfile, urllib.parse
from typing import Dict, List, Optional

import numpy as np
from PIL import Image
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import firestore, storage
import requests

# NEW: Import the updated Google GenAI SDK
from google import genai

from model import ArtifactIndex, ClipQueryEncoder, FaissSearcher

# -----------------------------------------------------------------------------
# Credentials init (supports file path OR raw JSON env var)
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
BOOST_PER_MATCH = float(os.getenv("BOOST_PER_MATCH", "0.18"))
CORS_ALLOWED_ORIGIN = os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

SIZE_PREF_BOOST = float(os.getenv("SIZE_PREF_BOOST", "0.35"))
COLOR_PREF_BOOST = float(os.getenv("COLOR_PREF_BOOST", "0.25"))

# NEW: Initialize the new Gemini Client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# -----------------------------------------------------------------------------
# App + Clients
# -----------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, origins=[CORS_ALLOWED_ORIGIN], supports_credentials=False)

db = firestore.Client(project=PROJECT_ID or None)
gcs = storage.Client(project=PROJECT_ID or None)

# -----------------------------------------------------------------------------
# AI Interior Designer Logic
# -----------------------------------------------------------------------------
def analyze_with_gemini(img_b64, text, f_type, size_pref, color_pref, min_b, max_b, top_items):
    """
    Passes the room image and user parameters to Gemini to generate
    an interior design analysis and 2 custom out-of-catalog concepts.
    """
    try:
        if not gemini_client:
            return None

        contents = []

        prompt = f"""
        You are an expert interior designer working for a custom furniture shop.
        The user is looking for furniture with these preferences:
        - Type: {f_type or 'Not specified'}
        - Size: {size_pref or 'Not specified'}
        - Color: {color_pref or 'Not specified'}
        - Budget: {min_b or 0} to {max_b or 'Any'} PHP
        - Extra Text: {text}

        Top matching items from our ready-to-ship catalog:
        """
        for i, item in enumerate(top_items):
            prompt += f"\n{i+1}. {item.get('title')} (Price: {item.get('price')} PHP)"

        prompt += """
        Analyze the room image (if provided) and the user's preferences.
        Output ONLY valid JSON with no markdown formatting or code blocks. Do not use ```json.
        Structure exactly like this:
        {
          "room_analysis": "A warm, personalized 2-3 sentence paragraph analyzing their room's interior design style and explaining why the ready-to-ship catalog items match their aesthetic.",
          "custom_concepts": [
            {
              "title": "Name of a custom furniture piece NOT in our catalog",
              "description": "Why this specific custom piece would look amazing in their room.",
              "category": "The general category of the item (e.g., Sofa, Bed, Chair)",
              "suggested_color": "The recommended color",
              "image_prompt": "A highly detailed, photorealistic prompt for an AI image generator to draw this specific furniture piece isolated in a beautiful matching room setting."
            }
          ]
        }
        Provide exactly 2 custom concepts.
        """
        
        # Attach the user's room image if they uploaded one
        if img_b64:
            img_data = base64.b64decode(img_b64)
            img = Image.open(io.BytesIO(img_data))
            contents.append(img)

        contents.append(prompt)

        # NEW: Syntax for generating content with google.genai
        response = gemini_client.models.generate_content(
            model='gemini-1.5-flash',
            contents=contents
        )
        
        resp_text = response.text.strip()
        
        # Clean markdown if Gemini hallucinates it
        if resp_text.startswith("```json"):
            resp_text = resp_text[7:]
        if resp_text.startswith("```"):
            resp_text = resp_text[3:]
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]

        parsed = json.loads(resp_text.strip())

        # Generate actual image URLs using Pollinations AI based on Gemini's prompt
        for concept in parsed.get("custom_concepts", []):
            img_prompt = concept.get("image_prompt", "")
            if img_prompt:
                # Add keywords to ensure high quality interior design renders
                enhanced_prompt = f"Professional interior design photography, highly detailed, 8k resolution, furniture catalog shot. {img_prompt}"
                encoded_prompt = urllib.parse.quote(enhanced_prompt)
                concept["image_url"] = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=800&height=600&nologo=true"

        return parsed
    except Exception as e:
        print(f"Gemini Error: {e}")
        return None

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

# -- size/color helpers -------------------------------------------------------

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

# ---- Firestore hydration (images) -------------------------------------------
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

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
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
  additionals_in  = _extract_additionals(data, text)
  w_image         = float(data.get("w_image", 0.7))
  w_text          = float(data.get("w_text", 0.3))
  color_weight    = float(data.get("color_weight", 0.35))
  color_mode      = str(data.get("color_mode", "match")).strip().lower()

  try:
      min_budget = float(data.get("min_budget")) if data.get("min_budget") else None
      max_budget = float(data.get("max_budget")) if data.get("max_budget") else None
  except ValueError:
      min_budget, max_budget = None, None

  if any(a.strip().lower() == "none" for a in additionals_in):
    additionals_in = []
    strict_mode = False
  else:
    strict_mode = bool(data.get("strict", True if additionals_in else False))

  fields_wanted = _map_additionals_to_fields(additionals_in)
  if fields_wanted:
    strict_mode = True

  flags_cache = _load_flags_cache()

  qvec = encoder.embed_query(text=text, image_b64=img_b64, w_image=w_image, w_text=w_text)

  rows, scores = searcher.search(qvec, k=max(k, 60))

  faiss_top_rows   = rows[:k]
  faiss_top_scores = [float(s) for s in scores[:k]]

  ranked: List[dict] = []
  for row, sc in zip(rows, scores):
    it = dict(art.row_to_item(row))
    pid = it.get("id")
    if not pid:
      continue
    if f_type and not _type_matches(it, f_type):
      continue
    
    price = float(it.get("basePrice") or it.get("price") or 0)
    if min_budget is not None and price < min_budget:
        continue
    if max_budget is not None and price > max_budget:
        continue

    it["score"] = float(sc)
    ranked.append(it)

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
      ranked = soft_boost(ranked)
  else:
    ranked = soft_boost(ranked)

  boosted: List[dict] = []
  for it in ranked:
    it2 = {**it}
    s_score = _size_match_score(it2, size_pref)
    c_score = _color_match_score(it2, color_pref)
    it2["size_match"] = s_score
    it2["color_match"] = c_score
    it2["score"] = it2["score"] + s_score * SIZE_PREF_BOOST + c_score * COLOR_PREF_BOOST
    boosted.append(it2)

  if (size_pref or color_pref) and any((it.get("size_match") or 0) > 0 or (it.get("color_match") or 0) > 0 for it in boosted):
    ranked = [it for it in boosted if (it.get("size_match") or 0) > 0 or (it.get("color_match") or 0) > 0]
  else:
    ranked = boosted

  ranked = [_ensure_item_avg_lab(it) for it in ranked]

  room_lab_used = None
  if img_b64:
    ranked, room_lab_used = _rerank_by_color(ranked, img_b64, weight=color_weight, mode=color_mode)

  ranked.sort(key=lambda x: x["score"], reverse=True)
  ranked = ranked[:k]

  payload_items = _to_ui(ranked, size_pref=size_pref, color_pref=color_pref)

  ai_designer_data = None
  if GEMINI_API_KEY:
      ai_designer_data = analyze_with_gemini(
          img_b64=img_b64,
          text=text,
          f_type=f_type,
          size_pref=size_pref,
          color_pref=color_pref,
          min_b=min_budget,
          max_b=max_budget,
          top_items=payload_items[:3] 
      )

  return jsonify({
    "items": payload_items,
    "products": payload_items,
    "results": payload_items,
    "ai_designer": ai_designer_data,
    "from": "catalog",
    "count": len(payload_items),
    "fallback": fallback_reason,
  })

if __name__ == "__main__":
  app.run(host="0.0.0.0", port=PORT, debug=True)