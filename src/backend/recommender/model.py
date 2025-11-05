# model.py
import json, os, io, base64
from typing import List, Dict, Tuple, Optional

import faiss
import torch
import clip
from PIL import Image


class ArtifactIndex:
    """Holds FAISS index + mapping loaded from your artifacts folder."""

    def __init__(self, artifacts_dir: str = "artifacts"):
        self.art_dir = artifacts_dir
        self.faiss_path = os.path.join(self.art_dir, "products.faiss")
        self.mapping_path = os.path.join(self.art_dir, "mapping.json")

        self.index: Optional[faiss.Index] = None
        self.mapping_list: List[dict] = []  # same order as FAISS rows
        self.id2row: Dict[str, int] = {}

    def load(self):
        if not (os.path.exists(self.faiss_path) and os.path.exists(self.mapping_path)):
            raise FileNotFoundError("artifacts not found (products.faiss / mapping.json).")
        self.index = faiss.read_index(self.faiss_path)
        with open(self.mapping_path, "r", encoding="utf-8") as f:
            self.mapping_list = json.load(f)
        self.id2row = {m["id"]: i for i, m in enumerate(self.mapping_list)}

    def size(self) -> int:
        return int(self.index.ntotal) if self.index is not None else 0

    def row_to_item(self, row: int) -> dict:
        return self.mapping_list[row]


class ClipQueryEncoder:
    """Encodes queries (image/text) with CLIP; vectors are L2-normalized."""

    def __init__(self, model_name: str = "ViT-B/32"):
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model, self.preprocess = clip.load(model_name, device=device, jit=False)
        self.model.eval()

    def _b64_to_pil(self, b64_str: str) -> Image.Image:
        data = base64.b64decode(b64_str)
        return Image.open(io.BytesIO(data)).convert("RGB")

    @torch.no_grad()
    def _encode_images(self, pil_images: List[Image.Image]) -> torch.Tensor:
        imgs = torch.stack([self.preprocess(im) for im in pil_images]).to(self.device)
        z = self.model.encode_image(imgs)
        z = z / z.norm(dim=-1, keepdim=True)
        return z.float().cpu()

    @torch.no_grad()
    def _encode_texts(self, texts: List[str]) -> torch.Tensor:
        tokens = clip.tokenize(texts, truncate=True).to(self.device)
        z = self.model.encode_text(tokens)
        z = z / z.norm(dim=-1, keepdim=True)
        return z.float().cpu()

    def embed_query(
        self,
        text: str = "",
        image_b64: Optional[str] = None,
        w_image: float = 0.7,
        w_text: float = 0.3,
    ) -> torch.Tensor:
        vec_img: Optional[torch.Tensor] = None
        vec_txt: Optional[torch.Tensor] = None

        if image_b64:
            try:
                pil = self._b64_to_pil(image_b64)
                vec_img = self._encode_images([pil])
            except Exception:
                vec_img = None

        if text:
            vec_txt = self._encode_texts([text])

        if vec_img is None and vec_txt is None:
            return self._encode_texts(["furniture"])

        if vec_img is None:
            return vec_txt  # type: ignore[return-value]
        if vec_txt is None:
            return vec_img  # type: ignore[return-value]

        q = (w_image * vec_img + w_text * vec_txt)
        q = q / q.norm(dim=-1, keepdim=True)
        return q


class FaissSearcher:
    """Thin wrapper to search your artifact index."""

    def __init__(self, art: ArtifactIndex):
        self.art = art

    def search(self, qvec: torch.Tensor, k: int) -> Tuple[List[int], List[float]]:
        if self.art.index is None or self.art.size() == 0:
            return [], []
        D, I = self.art.index.search(qvec.numpy().astype("float32"), k)
        rows = [i for i in I[0].tolist() if i >= 0]
        scores = [float(D[0][j]) for j, i in enumerate(I[0].tolist()) if i >= 0]
        return rows, scores
