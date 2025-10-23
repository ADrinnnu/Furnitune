// src/web/server/lib/llm-client.js
// OpenRouter chat client with automatic fallback + 429 handling

export class LlmClient {
  constructor({ model, fallbackModel } = {}) {
    this.model = model || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    this.fallbackModel = fallbackModel || process.env.OPENROUTER_FALLBACK_MODEL || "google/gemma-2-9b-it:free";
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    this.base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
    if (!this.apiKey) {
      // Throwing here surfaces a clear error during the first call
      console.warn("[LlmClient] OPENROUTER_API_KEY is missing");
    }
  }

  async chat(messages, { temperature = 0.2, top_p, max_tokens } = {}) {
    // Try primary
    try {
      return await this._chatWithModel(this.model, messages, { temperature, top_p, max_tokens });
    } catch (e) {
      // On 429 or network/server failure, try fallback (if different)
      const is429 = e?.code === 429 || /(^|[^0-9])429([^0-9]|$)/.test(String(e?.message || ""));
      const tryFallback = this.fallbackModel && this.fallbackModel !== this.model;
      if (is429 || tryFallback) {
        try {
          return await this._chatWithModel(this.fallbackModel, messages, { temperature, top_p, max_tokens });
        } catch (e2) {
          // If fallback also fails, rethrow original error
          throw e;
        }
      }
      throw e;
    }
  }

  async _chatWithModel(model, messages, { temperature = 0.2, top_p, max_tokens } = {}) {
    if (!this.apiKey) {
      const err = new Error("Missing OPENROUTER_API_KEY");
      err.code = "NO_KEY";
      throw err;
    }

    const payload = {
      model,
      messages,
      temperature,
      ...(top_p != null ? { top_p } : {}),
      ...(max_tokens ? { max_tokens } : {}),
    };

    const res = await fetch(this.base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_URL || "http://localhost",
        "X-Title": "Furnitune BizChat",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const err = new Error("OpenRouter rate limit (429)");
      err.code = 429;
      err.detail = await res.text().catch(() => "");
      throw err;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const err = new Error(`openrouter HTTP ${res.status}${txt ? ` — ${txt}` : ""}`);
      err.code = res.status;
      err.detail = txt;
      throw err;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  }
}
