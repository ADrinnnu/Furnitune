export async function cloudComplete(prompt, { temperature = 0.2 } = {}) {
  const provider = (process.env.LLM_PROVIDER || "openrouter").toLowerCase();

  if (provider === "openrouter") {
    const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("Missing OPENROUTER_API_KEY");
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Furnitune BizChat"
      },
      body: JSON.stringify({ model, temperature, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) throw new Error(`openrouter HTTP ${r.status}`);
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }]}],
        generationConfig: { temperature }
      })
    });
    if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  if (provider === "hf" || provider === "huggingface") {
    const model = process.env.HF_MODEL || "Qwen/Qwen2.5-1.5B-Instruct";
    const key = process.env.HF_API_TOKEN;
    if (!key) throw new Error("Missing HF_API_TOKEN");
    const r = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 300, temperature } })
    });
    if (!r.ok) throw new Error(`hf HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j === "string") return j;
    if (Array.isArray(j) && j[0]?.generated_text) return j[0].generated_text;
    return j?.generated_text ?? JSON.stringify(j);
  }

  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
