// src/web/server/lib/ollama-client.js
import { Ollama } from "ollama";

export class OllamaClient {
  constructor({ model, host } = {}) {
    this.model = model || process.env.OLLAMA_MODEL || "llama3.1:8b-instruct";
    this.host = host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    this.client = new Ollama({ host: this.host });
  }

  async complete(prompt, opts = {}) {
    // Simple chat-completion call; only used when LLM_PROVIDER is NOT set.
    const r = await this.client.chat({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      options: { temperature: opts.temperature ?? 0.2 },
    });
    return r?.message?.content || "";
  }
}
