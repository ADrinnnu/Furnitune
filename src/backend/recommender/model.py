# src/backend/recommender/model.py
import io
import numpy as np
import requests
from PIL import Image
import torch
import faiss
from transformers import CLIPProcessor, CLIPModel


class RecommenderModel:
    """
    CLIP for embeddings (image+text) + FAISS for ANN ranking.
    - Embeddings are L2-normalized and searched with IndexFlatIP (cosine).
    """
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(self.device)
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        self.index = None
        self.product_ids = []

    # ---------- CLIP helpers ----------
    def embed_image(self, pil_img):
        inputs = self.processor(images=pil_img, return_tensors="pt").to(self.device)
        with torch.no_grad():
            z = self.model.get_image_features(**inputs)
        z = z / z.norm(dim=-1, keepdim=True)  # cosine
        return z.cpu().numpy().astype("float32")

    def embed_text(self, text: str):
        inputs = self.processor(text=[text], return_tensors="pt").to(self.device)
        with torch.no_grad():
            z = self.model.get_text_features(**inputs)
        z = z / z.norm(dim=-1, keepdim=True)
        return z.cpu().numpy().astype("float32")

    # ---------- Index building (FAISS) ----------
    def build_index(self, product_images, product_ids):
        """
        product_images: list of HTTPS URLs
        product_ids:    list of string IDs in the same order
        """
        feats = []
        kept_ids = []

        for pid, url in zip(product_ids, product_images):
            try:
                r = requests.get(url, timeout=15)
                r.raise_for_status()
                pil = Image.open(io.BytesIO(r.content)).convert("RGB")
                feats.append(self.embed_image(pil))
                kept_ids.append(pid)
            except Exception as e:
                print(f"⚠️ embedding failed for {pid}: {e}")

        if not feats:
            print("❌ No embeddings created; index will not be built.")
            self.index = None
            self.product_ids = []
            return

        X = np.vstack(feats).astype("float32")  # [N, D], normalized
        dim = X.shape[1]

        # Inner-product on normalized vectors = cosine similarity
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(X)  # FAISS add()
        self.product_ids = kept_ids
        print(f"✅ Built FAISS index for {len(self.product_ids)} items")

    # ---------- Search ----------
    def search_with_scores(self, query_vecs, k=3):
        """
        query_vecs: list of 1xD numpy arrays (already normalized)
        returns: (ids, scores)
        """
        q = np.mean(query_vecs, axis=0).astype("float32")  # combine image+text
        sims, idxs = self.index.search(q, k)
        ids = [self.product_ids[i] for i in idxs[0]]
        return ids, sims[0]

    def search(self, query_vecs, k=3):
        ids, _ = self.search_with_scores(query_vecs, k)
        return ids
