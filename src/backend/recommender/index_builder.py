import argparse, os, json, io, faiss, torch
import numpy as np
from PIL import Image
import firebase_admin
from firebase_admin import credentials, firestore, storage
import requests
import clip
from tqdm import tqdm

def load_image_from_gs(gs_url):
    # gs://bucket/path/to/file
    assert gs_url.startswith("gs://")
    bucket = gs_url.split("gs://")[1].split("/")[0]
    path = "/".join(gs_url.split("gs://")[1].split("/")[1:])
    blob = storage.bucket(bucket).blob(path)
    buf = io.BytesIO()
    blob.download_to_file(buf)
    buf.seek(0)
    return Image.open(buf).convert("RGB")

def main(args):
    # Requires GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {"projectId": args.project, "storageBucket": args.bucket})
    db = firestore.client()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, preprocess = clip.load("ViT-B/32", device=device)

    # Pull only active products from your `products` collection
    docs = db.collection("products").where("active", "==", True).stream()

    vecs = []
    mapping = []
    for d in tqdm(docs, desc="Embedding products"):
        item = d.to_dict() or {}
        item["id"] = d.id

        # Choose a lead image: first from images[] or heroImage
        src = None
        if isinstance(item.get("images"), list) and item["images"]:
            src = item["images"][0]
        if not src:
            src = item.get("heroImage")
        if not src:
            continue

        # Load image from gs:// or https
        try:
            if str(src).startswith("gs://"):
                img = load_image_from_gs(src)
            else:
                r = requests.get(src, timeout=15)
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception:
            continue

        with torch.no_grad():
            x = preprocess(img).unsqueeze(0).to(device)
            z = model.encode_image(x)
            z = z / z.norm(dim=-1, keepdim=True)
            vec = z.cpu().numpy().astype("float32")

        vecs.append(vec)
        mapping.append({
            "id": item["id"],
            "title": item.get("name") or item.get("title") or "Untitled",
            "baseType": item.get("baseType"),
            "departmentSlug": item.get("departmentSlug"),
            "categorySlug": item.get("categorySlug"),
            "materials": item.get("materials") or item.get("material") or [],
            "seatCount": item.get("seatCount"),
            "colorOptions": item.get("colorOptions", []),
            "sizeOptions": item.get("sizeOptions", []),
            "basePrice": item.get("basePrice"),
            "image": src,
        })

    if not vecs:
        raise SystemExit("No vectors generated. Check Firestore/Storage fields.")

    X = np.concatenate(vecs, axis=0)
    d = X.shape[1]
    index = faiss.IndexFlatIP(d)          # cosine if vectors are unit-normalized
    index.add(X)

    os.makedirs("artifacts", exist_ok=True)
    faiss.write_index(index, "artifacts/products.faiss")
    with open("artifacts/mapping.json", "w") as f:
        json.dump(mapping, f)
    print("Wrote artifacts/products.faiss and artifacts/mapping.json")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--bucket", required=True)
    main(ap.parse_args())
