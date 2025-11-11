// src/web/server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LlmClient } from "./lib/llm-client.js";

/* ──────────────────────────────────────────────────────────────────────────
   App + CORS
   ────────────────────────────────────────────────────────────────────────── */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16mb" }));

const STATIC_ALLOW = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /\.vercel\.app$/i,                              // any *.vercel.app
  /^https?:\/\/furnitune-chats\.onrender\.com$/i, // your Render URL
];
function isOriginAllowed(origin) {
  try {
    if (!origin) return true; // server-to-server/health checks
    if (["http://localhost:5173","http://localhost:3000","https://adrinnnu.github.io"]
      .includes(new URL(origin).origin)) return true;
    return STATIC_ALLOW.some((rx) => rx.test(origin));
  } catch { return false; }
}
const corsOptions = {
  origin: (origin, cb) => isOriginAllowed(origin) ? cb(null, true) : cb(new Error("CORS blocked")),
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","x-bizchat-session","x-user-id","x-user-name"],
  credentials: false,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ──────────────────────────────────────────────────────────────────────────
   Model client
   ────────────────────────────────────────────────────────────────────────── */
const MODEL    = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const FALLBACK = process.env.OPENROUTER_FALLBACK_MODEL || "google/gemma-2-9b-it:free";
const llm = new LlmClient({ model: MODEL, fallbackModel: FALLBACK });

/* ──────────────────────────────────────────────────────────────────────────
   Knowledge loading (ENV → file → default)
   ────────────────────────────────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const INFO_FILE  = path.join(__dirname, "seed", "furnituneInfo.json");

const DEFAULT_FURNITUNE_INFO = `
Furnitune is an e-commerce platform for Santos Upholstery.
We sell ready-made furniture, support custom orders (dimensions, materials, and colors),
and offer repair services even for items not purchased from us.
`.trim();

function loadInfo() {
  // 1) ENV override
  const env = process.env.FURNITUNE_INFO;
  if (env && env.trim()) return env.trim();

  // 2) File next to this server file
  try {
    if (fs.existsSync(INFO_FILE)) {
      const j = JSON.parse(fs.readFileSync(INFO_FILE, "utf8"));
      if (j?.info && typeof j.info === "string" && j.info.trim()) return j.info.trim();
    }
  } catch (e) {
    console.warn("[bizchat] failed reading info file:", e.message);
  }

  // 3) Fallback
  return DEFAULT_FURNITUNE_INFO;
}

// Remove internal blocks and tidy
function cleanInfo(s) {
  return String(s || "")
    .replace(/\[BOT-SKIP\][\s\S]*?\[\/BOT-SKIP\]/gi, "")
    .trim();
}

let FURNITUNE_INFO = loadInfo();
const INFO_SOURCE = process.env.FURNITUNE_INFO?.trim()
  ? "ENV"
  : (fs.existsSync(INFO_FILE) ? INFO_FILE : "DEFAULT");
console.log("[bizchat] info source:", INFO_SOURCE, "len=", FURNITUNE_INFO.length);

/* ──────────────────────────────────────────────────────────────────────────
   Sessions / throttle
   ────────────────────────────────────────────────────────────────────────── */
const sessions = new Map(); // sid -> { greeted: false }
const lastHitPerSid = new Map();
const THROTTLE_MS = Number(process.env.BIZCHAT_THROTTLE_MS || 900);

/* ──────────────────────────────────────────────────────────────────────────
   Health, root, reload, debug
   ────────────────────────────────────────────────────────────────────────── */
app.get("/", (_req, res) => {
  res.type("html").send(`
    <style>body{font-family:system-ui;margin:32px;line-height:1.5}</style>
    <h1>Furnitune BizChat API</h1>
    <p>Service is running.</p>
    <ul>
      <li><code>GET /health</code></li>
      <li><code>POST /bizchat/ask</code></li>
      <li><code>POST /bizchat/reload-info</code></li>
    </ul>
  `);
});
const healthHandler = (_req, res) => res.json({ ok: true, model: MODEL, fallback: FALLBACK });
app.get("/health", healthHandler);
app.get("/bizchat/health", healthHandler);

app.post("/reload-info", (_req, res) => {
  FURNITUNE_INFO = loadInfo();
  res.json({ ok: true, len: FURNITUNE_INFO.length });
});
app.post("/bizchat/reload-info", (_req, res) => {
  FURNITUNE_INFO = loadInfo();
  res.json({ ok: true, len: FURNITUNE_INFO.length });
});

// optional debug
app.get("/bizchat/debug/info", (_req, res) => {
  res.json({
    len: FURNITUNE_INFO?.length || 0,
    fromEnv: !!(process.env.FURNITUNE_INFO && process.env.FURNITUNE_INFO.trim()),
    infoFile: INFO_FILE,
    fileExists: fs.existsSync(INFO_FILE),
    preview: String(cleanInfo(FURNITUNE_INFO)).slice(0, 300)
  });
});

/* ──────────────────────────────────────────────────────────────────────────
   Ask handler (mounted under /ask and /bizchat/ask)
   ────────────────────────────────────────────────────────────────────────── */
async function askHandler(req, res) {
  try {
    const sid = String(req.body.sessionId || req.get("x-bizchat-session") || "anon");
    const user = req.body.user || {};
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ error: "Missing question" });

    // throttle per-session
    const now = Date.now();
    const last = lastHitPerSid.get(sid) || 0;
    if (now - last < THROTTLE_MS) return res.json({ answer: "One moment, please." });
    lastHitPerSid.set(sid, now);

    // greet-once memory
    const sess = sessions.get(sid) || { greeted: false };
    sessions.set(sid, sess);
    const greetOnce = !sess.greeted && user?.name
      ? `Start by saying "Hi ${user.name}!" once, then avoid re-greeting.`
      : "";

    const system = `
You are Furni, the official chatbot for Furnitune — an e-commerce platform for Santos Upholstery.
Use ONLY the Furnitune information provided below. Do NOT explain how language models work.
If information is insufficient, reply exactly:
"I'm sorry, I can only answer questions about Furnitune’s products, services, or policies."
${greetOnce}`.trim();

    const userContent = `
Answer ONLY from this Furnitune information:

${cleanInfo(FURNITUNE_INFO)}

User question: ${question}

Rules:
- Keep the reply concise: 1–2 sentences, maximum 45 words.
- No lists, no bullet points, no emojis, no headings, no marketing fluff.
- If the info above doesn't contain the answer, reply with the exact sentence:
  "I'm sorry, I can only answer questions about Furnitune’s products, services, or policies."

Return your reply ONLY between these markers:
<<<ANSWER>>>
<your reply>
<<<END>>>`.trim();

    let raw =
      (await llm.chat(
        [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        { temperature: 0.15, top_p: 0.2, max_tokens: 160 }
      )) ||
      `I'm sorry, I can only answer questions about Furnitune’s products, services, or policies.`;

    // extract + sanitize
    const extractFenced = (t) => {
      const m = /<<<ANSWER>>>[\s\r\n]*([\s\S]*?)[\s\r\n]*<<<END>>>/i.exec(t || "");
      return (m ? m[1] : t || "").trim();
    };
    const words = (n) => n.trim().split(/\s+/).filter(Boolean);
    const firstSentences = (s, max = 2) => {
      const parts = s.split(/(?<=[.!?])\s+/).filter(Boolean);
      return parts.slice(0, max).join(" ");
    };
    const clampWords = (s, max = 45) => {
      const w = words(s);
      return w.length <= max ? s : w.slice(0, max).join(" ");
    };
    const stripFormatting = (s) =>
      s.replace(/[*_`#>-]/g, "").replace(/^[\s:–—-]+/, "").replace(/\s{2,}/g, " ").trim();

    const DRIFT_RX =
      /(as an ai|as a language model|i,?\s*gemma|i can:\s*\*|let me explain|how i.*(work|function)|virtual room design|budget analyzer|decor ideas engine|home decor platform)/i;
    const UNRELATED_RX =
      /(poetry|write a story|translate languages?|coding help|resume|essay|creative writing)/i;

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
    if (e && (e.code === 429 || /rate limit/i.test(String(e.detail || e.message || "")))) {
      return res.status(200).json({
        answer:
          "I’m at my daily free limit right now. Please try again later, or email furnitunecp@gmail.com or call 09650934957.",
      });
    }
    console.error("ask error:", e?.detail || e?.response?.data || e?.message || e);
    res.status(200).json({
      answer:
        "Sorry — I couldn’t fetch that right now. Please email furnitunecp@gmail.com or call 09650934957.",
    });
  }
}

app.post("/ask", askHandler);
app.post("/bizchat/ask", askHandler);

/* ──────────────────────────────────────────────────────────────────────────
   404 + error handler (nice responses)
   ────────────────────────────────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Server error" });
});

/* ──────────────────────────────────────────────────────────────────────────
   Boot
   ────────────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 7861;
app.listen(PORT, () => {
  console.log(`bizchat up on :${PORT}`);
});
