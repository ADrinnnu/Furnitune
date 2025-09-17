// src/web/server/lib/llm-client.js
// Tiny OpenRouter chat-completions client

export class LlmClient {
  constructor({ model }) {
    this.model = model;
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    this.base = "https://openrouter.ai/api/v1/chat/completions";
  }

  async complete(prompt, opts = {}) {
    if (!this.apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    const body = {
      model: this.model || "google/gemma-2-9b-it:free",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2
    };

    const res = await fetch(this.base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "http://localhost",
        "X-Title": "Furnitune BizChat"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`openrouter HTTP ${res.status}${txt ? ` — ${txt}` : ""}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
}
