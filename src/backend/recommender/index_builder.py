import argparse, os, json, io, faiss, torch
import numpy as np
from PIL import Image
import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud import storage as gcs
import requests
import clip
from tqdm import tqdm
from urllib.parse import quote as urlquote
import google.auth
from google.auth.transport.requests import Request as GAuthRequest


# ---------------------------------------------------------------------------
# Config (env-driven)
# ---------------------------------------------------------------------------
FIREBASE_BUCKET = os.getenv("FIREBASE_BUCKET", "").strip()   # e.g. furnitune-64458.firebasestorage.app


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _looks_keep(p: str) -> bool:
    return isinstance(p, str) and (p.endswith("/.keep") or p.endswith(".keep"))


def _first_nonkeep(imgs):
    if not isinstance(imgs, list):
        return None
    for u in imgs:
        if isinstance(u, str) and not _looks_keep(u):
            return u
    return None


def _choose_lead_image(item: dict) -> str | None:
    """
    Priority:
      1) images[]
      2) imagesByOption first non-.keep
      3) defaultImagePath
      4) heroImage
    Returns a single http(s) or gs:// URL (may be firebasestorage.app or appspot.com).
    """
    u = _first_nonkeep(item.get("images") or [])
    if u:
        return u

    ibo = item.get("imagesByOption") or {}
    if isinstance(ibo, dict):
        for sizes in ibo.values():
            if isinstance(sizes, dict):
                for arr in sizes.values():
                    u = _first_nonkeep(arr)
                    if u:
                        return u

    for key in ("defaultImagePath", "heroImage"):
        v = item.get(key)
        if isinstance(v, str) and not _looks_keep(v):
            return v
    return None


def _normalize_gs(gs_url: str, project: str) -> str:
    """
    Normalize any gs:// URL to use the actual bucket we were given (env),
    otherwise fallback to <project>.appspot.com.
    """
    if not isinstance(gs_url, str) or not gs_url.startswith("gs://"):
        return gs_url
    rest = gs_url[5:]
    parts = rest.split("/", 1)
    path = parts[1] if len(parts) > 1 else ""
    bucket = FIREBASE_BUCKET or f"{project}.appspot.com"
    return f"gs://{bucket}/{path}"


def _avg_lab(pil: Image.Image):
    try:
        im = pil.resize((96, 96)).convert("LAB")
        arr = np.asarray(im, dtype=np.float32)
        return [
            float(arr[:, :, 0].mean()),
            float(arr[:, :, 1].mean()),
            float(arr[:, :, 2].mean()),
        ]
    except Exception:
        return None


def _get_access_token() -> str | None:
    """OAuth token suitable for GCS JSON API downloads."""
    try:
        scopes = ["https://www.googleapis.com/auth/devstorage.read_only"]
        creds, _ = google.auth.default(scopes=scopes)
        if not creds.valid:
            creds.refresh(GAuthRequest())
        return creds.token
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Robust image downloader
# ---------------------------------------------------------------------------
def _download_image_any(u: str, gcs_client: gcs.Client, bucket_default) -> Image.Image | None:
    """
    Try in order:
      1) http(s) direct
      2) gs:// via GCS JSON API (OAuth)
      3) gs:// via Signed URL + requests.get
      4) gs:// via Admin SDK download_to_file
    """
    try:
        # 1) http(s)
        if isinstance(u, str) and u.startswith("http"):
            r = requests.get(u, timeout=20)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB")

        # 2/3/4) gs://
        if isinstance(u, str) and u.startswith("gs://"):
            rest = u[5:]
            bkt, path = rest.split("/", 1)

            # If it's firebasestorage.app, convert to the real bucket name we use
            if bkt.endswith(".firebasestorage.app"):
                proj = bkt.split(".")[0]
                bkt_norm = FIREBASE_BUCKET or f"{proj}.appspot.com"
            else:
                bkt_norm = FIREBASE_BUCKET or bkt

            # 2) GCS JSON API (IAM, bypasses Firebase rules)
            try:
                tok = _get_access_token()
                if tok:
                    gcs_url = (
                        f"https://storage.googleapis.com/download/storage/v1/b/"
                        f"{bkt_norm}/o/{urlquote(path, safe='')}"
                    )
                    r = requests.get(
                        gcs_url,
                        params={"alt": "media"},
                        headers={"Authorization": f"Bearer {tok}"},
                        timeout=20,
                    )
                    if r.status_code == 200 and r.content:
                        return Image.open(io.BytesIO(r.content)).convert("RGB")
            except Exception:
                pass

            # 3) Signed URL (useful if IAM is fine but token path fails)
            try:
                blob = gcs_client.bucket(bkt_norm).blob(path)
                url = blob.generate_signed_url(
                    version="v4",
                    expiration=900,
                    method="GET",
                )
                r = requests.get(url, timeout=20)
                r.raise_for_status()
                return Image.open(io.BytesIO(r.content)).convert("RGB")
            except Exception:
                pass

            # 4) Admin SDK fallback
            try:
                bucket = storage.bucket(bkt_norm) if bkt_norm else bucket_default
                buf = io.BytesIO()
                bucket.blob(path).download_to_file(buf)
                buf.seek(0)
                return Image.open(buf).convert("RGB")
            except Exception:
                return None

    except Exception:
        return None

    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main(args):
    # Resolve bucket
    bucket_name = FIREBASE_BUCKET or f"{args.project}.appspot.com"

    # Credentials (use explicit JSON if provided)
    key_path = os.getenv("FIREBASE_SERVICE_JSON", "serviceAccountKey.json")
    if os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
    else:
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(
        cred,
        {
            "projectId": args.project,
            "storageBucket": bucket_name,
        },
    )

    # Clients
    db = firestore.client()
    bucket_default = storage.bucket(bucket_name)   # Admin SDK bucket
    gcs_client = gcs.Client(project=args.project)  # google-cloud-storage client

    # CLIP
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load("ViT-B/32", device=device, jit=False)
    model.eval()

    # Products
    docs = db.collection("products").where("active", "==", True).stream()

    vecs, mapping = [], []
    embedded_img = embedded_txt = total = 0

    for d in tqdm(docs, desc="Embedding products"):
        total += 1
        item = d.to_dict() or {}
        item["id"] = d.id

        # Choose a lead image and normalize gs:// to our bucket
        lead = _choose_lead_image(item)
        if isinstance(lead, str) and lead.startswith("gs://"):
            lead = _normalize_gs(lead, args.project)

        # Try to fetch the image
        pil = (
            _download_image_any(lead, gcs_client, bucket_default)
            if isinstance(lead, str) and lead
            else None
        )

        with torch.no_grad():
            if pil is not None:
                x = preprocess(pil).unsqueeze(0).to(device)
                z = model.encode_image(x)
                z = z / z.norm(dim=-1, keepdim=True)
                vec = z.cpu().numpy().astype("float32")
                embedded_img += 1
            else:
                # Text fallback if no image
                name = item.get("name") or item.get("title") or d.id
                dept = item.get("departmentSlug") or item.get("categorySlug") or ""
                opts = item.get("options") or {}
                sizes = opts.get("sizes") or item.get("sizeOptions") or []
                colors = opts.get("colors") or item.get("colorOptions") or []
                text = " ".join(
                    [
                        str(name),
                        str(dept),
                        " ".join(
                            [
                                s.get("label") or s.get("id") or str(s)
                                for s in sizes
                                if isinstance(s, dict)
                            ]
                        ),
                        " ".join(
                            [
                                c.get("label") or c.get("name") or c.get("id") or str(c)
                                for c in colors
                                if isinstance(c, dict)
                            ]
                        ),
                    ]
                ).strip() or "furniture"
                tokens = clip.tokenize([text], truncate=True).to(device)
                z = model.encode_text(tokens)
                z = z / z.norm(dim=-1, keepdim=True)
                vec = z.cpu().numpy().astype("float32")
                embedded_txt += 1

        vecs.append(vec)

        # ----- normalize options for mapping (top-level OR options.*) -----
        opts = item.get("options") or {}
        color_opts = item.get("colorOptions") or opts.get("colors") or []
        size_opts = item.get("sizeOptions") or opts.get("sizes") or []

        # Raw images & meta for the API to reuse
        raw_images = item.get("images") or []
        images_by_option = item.get("imagesByOption") or {}

        mapping.append(
            {
                "id": item["id"],
                "title": item.get("name") or item.get("title") or "Untitled",
                "baseType": item.get("baseType"),
                "departmentSlug": item.get("departmentSlug"),
                "categorySlug": item.get("categorySlug"),
                "materials": item.get("materials") or item.get("material") or [],
                "seatCount": item.get("seatCount"),
                "colorOptions": color_opts,
                "sizeOptions": size_opts,
                "basePrice": item.get("basePrice"),
                # image-related fields that the API/frontend can use
                "image": lead or "",
                "thumbnail": item.get("thumbnail") or lead or "",
                "defaultImagePath": item.get("defaultImagePath") or "",
                "heroImage": item.get("heroImage") or "",
                "images": raw_images,
                "imagesByOption": images_by_option,
                # precomputed average color for color-matching
                "avg_lab": _avg_lab(pil) if pil is not None else None,
            }
        )

    if not vecs:
        raise SystemExit("No vectors generated. Check your bucket name and image fields.")

    X = np.concatenate(vecs, axis=0)
    index = faiss.IndexFlatIP(X.shape[1])   # cosine (unit vectors, because we L2-normalized)
    index.add(X)

    os.makedirs("artifacts", exist_ok=True)
    faiss.write_index(index, "artifacts/products.faiss")
    with open("artifacts/mapping.json", "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False)

    print("Wrote artifacts/products.faiss and artifacts/mapping.json")
    print(
        f"Summary: total={total} embedded_img={embedded_img} embedded_txt={embedded_txt}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    main(ap.parse_args())
