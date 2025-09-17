// Simple in-memory vector store with cosine similarity search.
export class VectorStore {
  constructor() {
    this.vectors = []; // Float32Array[]
    this.items = [];   // arbitrary payloads aligned with vectors
  }
  addMany(vectors, items) {
    if (vectors.length !== items.length) throw new Error("vectors/items length mismatch");
    for (let i = 0; i < vectors.length; i++) {
      this.vectors.push(vectors[i]);
      this.items.push(items[i]);
    }
  }
  size() { return this.items.length; }
  search(queryVec, k = 6) {
    const scores = [];
    for (let i = 0; i < this.vectors.length; i++) {
      const s = this._dot(queryVec, this.vectors[i]); // vectors are normalized
      scores.push({ score: s, item: this.items[i], index: i });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }
  _dot(a, b) {
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += a[i] * b[i];
    return sum;
  }
}
