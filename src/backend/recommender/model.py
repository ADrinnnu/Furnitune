# model.py
import json, os, io, base64
from typing import List, Dict, Tuple, Optional

import faiss
import torch
import clip
from PIL import Image


class ArtifactIndex:
    """
    Holds FAISS index + mapping loaded from your artifacts folder.

    Expects:
      artifacts/
        - products.faiss
        - mapping.json
    """

    def __init__(self, artifacts_dir: str = "artifacts"):
        self.art_dir = artifacts_dir
        self.faiss_path = os.path.join(self.art_dir, "products.faiss")
        self.mapping_path = os.path.join(self.art_dir, "mapping.json")

        self.index: Optional[faiss.Index] = None
        self.mapping_list: List[dict] = []  # same order as FAISS rows
        self.id2row: Dict[str, int] = {}

    def load(self):
        """Load FAISS index + mapping from disk."""
        if not (os.path.exists(self.faiss_path) and os.path.exists(self.mapping_path)):
            raise FileNotFoundError("artifacts not found (products.faiss / mapping.json).")

        self.index = faiss.read_index(self.faiss_path)

        with open(self.mapping_path, "r", encoding="utf-8") as f:
            self.mapping_list = json.load(f)

        # Map product id -> row index
        self.id2row = {m["id"]: i for i, m in enumerate(self.mapping_list) if "id" in m}

    def size(self) -> int:
        """Number of vectors in the index."""
        return int(self.index.ntotal) if self.index is not None else 0

    def row_to_item(self, row: int) -> dict:
        """Return mapping entry for a given FAISS row index."""
        return self.mapping_list[row]

    def id_to_item(self, pid: str) -> Optional[dict]:
        """Optional helper: look up a product by id using the mapping cache."""
        i = self.id2row.get(pid)
        if i is None:
            return None
        return self.mapping_list[i]


class ClipQueryEncoder:
    """
    Encodes queries (image + text) with CLIP; vectors are L2-normalized.

    Used for:
      - User room photo (image_b64)
      - User text prefs (type, size, color, additionals)
      - Mixture of both (weighted sum)
    """

    def __init__(self, model_name: str = "ViT-B/32"):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model, self.preprocess = clip.load(model_name, device=device, jit=False)
        self.model.eval()

    # ---------- helpers ----------

    def _b64_to_pil(self, b64_str: str) -> Image.Image:
        """Decode base64 string to a RGB PIL image."""
        data = base64.b64decode(b64_str)
        return Image.open(io.BytesIO(data)).convert("RGB")

    @torch.no_grad()
    def _encode_images(self, pil_images: List[Image.Image]) -> torch.Tensor:
        """Encode one or more PIL images with CLIP image encoder."""
        imgs = torch.stack([self.preprocess(im) for im in pil_images]).to(self.device)
        z = self.model.encode_image(imgs)
        z = z / z.norm(dim=-1, keepdim=True)
        return z.float().cpu()

    @torch.no_grad()
    def _encode_texts(self, texts: List[str]) -> torch.Tensor:
        """Encode one or more text strings with CLIP text encoder."""
        tokens = clip.tokenize(texts, truncate=True).to(self.device)
        z = self.model.encode_text(tokens)
        z = z / z.norm(dim=-1, keepdim=True)
        return z.float().cpu()

    # ---------- public API ----------

    def embed_query(
        self,
        text: str = "",
        image_b64: Optional[str] = None,
        w_image: float = 0.7,
        w_text: float = 0.3,
    ) -> torch.Tensor:
        """
        Build a single query vector from optional text + optional image.

        Args:
          text:      User text preferences ("Sectional, 6 seater, red, with storage").
          image_b64: Base64-encoded image of the room.
          w_image:   Weight for image embedding when both are present.
          w_text:    Weight for text embedding when both are present.

        Returns:
          A (1, D) torch.Tensor, L2-normalized, ready for FAISS.search().
        """
        vec_img: Optional[torch.Tensor] = None
        vec_txt: Optional[torch.Tensor] = None

        # Image (room photo) branch
        if image_b64:
            try:
                pil = self._b64_to_pil(image_b64)
                vec_img = self._encode_images([pil])
            except Exception:
                # If anything goes wrong, silently ignore and fall back to text
                vec_img = None

        # Text (preferences) branch
        if text:
            vec_txt = self._encode_texts([text])

        # If nothing provided, use a neutral fallback
        if vec_img is None and vec_txt is None:
            return self._encode_texts(["furniture"])

        # Only one of them
        if vec_img is None:
            return vec_txt  # type: ignore[return-value]
        if vec_txt is None:
            return vec_img  # type: ignore[return-value]

        # Both: weighted blend
        q = (w_image * vec_img + w_text * vec_txt)
        q = q / q.norm(dim=-1, keepdim=True)
        return q


class FaissSearcher:
    """Thin wrapper to search your artifact index."""

    def __init__(self, art: ArtifactIndex):
        self.art = art

    def search(self, qvec: torch.Tensor, k: int) -> Tuple[List[int], List[float]]:
        """
        Search the FAISS index.

        Args:
          qvec: (1, D) query vector from ClipQueryEncoder.embed_query().
          k:    Number of neighbors to retrieve.

        Returns:
          rows:   List of FAISS row indices (ints).
          scores: Corresponding similarity scores (floats).
        """
        if self.art.index is None or self.art.size() == 0:
            return [], []

        D, I = self.art.index.search(qvec.numpy().astype("float32"), k)

        # Filter out -1 entries if FAISS returns them
        rows_raw = I[0].tolist()
        scores_raw = D[0].tolist()

        rows = [i for i in rows_raw if i >= 0]
        scores = [float(scores_raw[j]) for j, i in enumerate(rows_raw) if i >= 0]

        return rows, scores
