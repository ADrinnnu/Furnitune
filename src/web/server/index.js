// src/web/server/index.js
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";

import { LlmClient } from "./lib/llm-client.js"; // exposes chat(messages, opts)


// ----------------------------------------------------------------------------
// App setup
// ----------------------------------------------------------------------------
const app = express();

app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-bizchat-session", "x-user-id", "x-user-name"],
  })
);
app.use(bodyParser.json({ limit: "16mb" }));

// ----------------------------------------------------------------------------
// Model / client (GPT-4o-mini primary, Gemma free fallback)
// ----------------------------------------------------------------------------
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const FALLBACK = process.env.OPENROUTER_FALLBACK_MODEL || "google/gemma-2-9b-it:free";
const llm = new LlmClient({ model: MODEL, fallbackModel: FALLBACK });

// ----------------------------------------------------------------------------
// Furnitune info (mirror the app: small fixed blurb)
// ----------------------------------------------------------------------------
const DEFAULT_FURNITUNE_INFO = `
Furnitune is an e-commerce platform for Santos Upholstery.
We sell ready-made furniture, support custom orders (dimensions, materials, and colors),
and offer repair services even for items not purchased from us.
`.trim();

// Optional: load from a JSON file like the app does (if present)
function loadInfo() {
  try {
    const p = path.join(process.cwd(), "src", "web", "server", "seed", "furnituneInfo.json");
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j?.info && typeof j.info === "string" && j.info.trim().length > 0) return j.info.trim();
    }
  } catch {}
  if (process.env.FURNITUNE_INFO && process.env.FURNITUNE_INFO.trim()) {
    return process.env.FURNITUNE_INFO.trim();
  }
  return DEFAULT_FURNITUNE_INFO;
}
let FURNITUNE_INFO = loadInfo();

// Tiny in-memory session (for greet-once, same behavior as app)
const sessions = new Map(); // sid -> { greeted: false }

// Optional: simple per-session throttle to avoid rate spikes
const lastHitPerSid = new Map();
const THROTTLE_MS = 900;

// ----------------------------------------------------------------------------
// Health + hot reload
// ----------------------------------------------------------------------------
app.get("/bizchat/health", (_req, res) => res.json({ ok: true, model: MODEL, fallback: FALLBACK }));

app.post("/bizchat/reload-info", (_req, res) => {
  FURNITUNE_INFO = loadInfo();
  res.json({ ok: true, len: FURNITUNE_INFO.length });
});

// ----------------------------------------------------------------------------
// Ask — EXACT app flow: system + user; concise; no RAG
// ----------------------------------------------------------------------------
app.post("/bizchat/ask", async (req, res) => {
  try {
    const sid = String(req.body.sessionId || req.get("x-bizchat-session") || "anon");
    const user = req.body.user || {};
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ error: "Missing question" });

    // throttle (per session)
    const now = Date.now();
    const last = lastHitPerSid.get(sid) || 0;
    if (now - last < THROTTLE_MS) {
      return res.json({ answer: "One moment, please." });
    }
    lastHitPerSid.set(sid, now);

    // tiny session for greet-once
    const sess = sessions.get(sid) || { greeted: false };
    sessions.set(sid, sess);

    const greetOnce =
      !sess.greeted && user?.name ? `Start by saying "Hi ${user.name}!" once, then avoid re-greeting.` : "";

    const system = `
You are Furni, the official chatbot for Furnitune — an e-commerce platform for Santos Upholstery.
Use ONLY the Furnitune information provided below. Do NOT explain how language models work.
If information is insufficient, reply exactly:
"I'm sorry, I can only answer questions about Furnitune’s products, services, or policies."
${greetOnce}
`.trim();

    // 1–2 sentences, ≤45 words; no lists/emojis/headers; fence the answer
    const userContent = `
Answer ONLY from this Furnitune information:

${FURNITUNE_INFO}

User question: ${question}

Rules:
- Keep the reply concise: 1–2 sentences, maximum 45 words.
- No lists, no bullet points, no emojis, no headings, no marketing fluff.
- If the info above doesn't contain the answer, reply with the exact sentence:
  "I'm sorry, I can only answer questions about Furnitune’s products, services, or policies."

Return your reply ONLY between these markers:
<<<ANSWER>>>
<your reply>
<<<END>>>
`.trim();

    let raw =
      (await llm.chat(
        [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        { temperature: 0.15, top_p: 0.2, max_tokens: 160 }
      )) || `I'm sorry, I can only answer questions about Furnitune’s products, services, or policies.`;

    // Extract & sanitize
    const extractFenced = (t) => {
      const m = /<<<ANSWER>>>[\s\r\n]*([\s\S]*?)[\s\r\n]*<<<END>>>/i.exec(t || "");
      return (m ? m[1] : t || "").trim();
    };
    const words = (n) => n.trim().split(/\s+/).filter(Boolean);
    const firstSentences = (s, maxSentences = 2) => {
      const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
      return parts.slice(0, maxSentences).join(" ");
    };
    const clampWords = (s, max = 45) => {
      const w = words(s);
      return w.length <= max ? s : w.slice(0, max).join(" ");
    };
    const stripFormatting = (s) =>
      s
        .replace(/[*_`#>-]/g, "")
        .replace(/^[\s:–—-]+/, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    const DRIFT_RX =
      /(as an ai|as a language model|i,?\s*gemma|i can:\s*\*|let me explain|how i.*(work|function)|virtual room design|budget analyzer|decor ideas engine|home decor platform)/i;
    const UNRELATED_RX = /(poetry|write a story|translate languages?|coding help|resume|essay|creative writing)/i;

    let ans = extractFenced(raw);
    if (DRIFT_RX.test(ans) || UNRELATED_RX.test(ans)) {
      ans = `I'm sorry, I can only answer questions about Furnitune’s products, services, or policies.`;
    }

    ans = stripFormatting(firstSentences(ans, 2));
    ans = clampWords(ans, 45);

    if (/^\s*what\s+is\s+furnitune\??\s*$/i.test(question)) {
      ans =
        "Furnitune is an e-commerce platform for Santos Upholstery that sells ready-made furniture, supports custom orders (dimensions, materials, colors), and offers repair services even for items not bought from us.";
    }

    if (!sess.greeted && user?.name) sess.greeted = true;

    res.json({ answer: ans });
  } catch (e) {
    // Friendly handling for daily free quota exhaustion across both models
    if (e && (e.code === 429 || /rate limit/i.test(String(e.detail || e.message || "")))) {
      return res.status(200).json({
        answer:
          "I’m at my daily free limit right now. Please try again later, or email Furnitune@jameyl.com or call 123-323-312.",
      });
    }

    console.error("ask error:", e?.detail || e?.response?.data || e?.message || e);
    return res.status(200).json({
      answer:
        "Sorry — I couldn’t fetch that right now. Please email Furnitune@jameyl.com or call 123-323-312.",
    });
  }
});

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
const PORT = process.env.PORT || 7861;
app.listen(PORT, () => {
  console.log(`bizchat up on :${PORT}`);
});
