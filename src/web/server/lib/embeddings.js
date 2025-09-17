// Sentence embeddings using Transformers.js (CPU-friendly).
export class Embedding {
  static async boot() {
    const { pipeline } = await import('@xenova/transformers');
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    return new Embedding(pipe);
  }
  constructor(pipe) { this.pipe = pipe; }
  async embedOne(text) {
    const out = await this.pipe(text, { pooling: 'mean', normalize: true });
    // out is a Tensor; .data is a Float32Array
    return new Float32Array(out.data);
  }
  async embedMany(texts) {
    const vecs = [];
    for (const t of texts) vecs.push(await this.embedOne(t));
    return vecs;
  }
}
