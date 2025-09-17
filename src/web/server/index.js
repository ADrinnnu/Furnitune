// src/web/server/index.js
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import { Embedding } from "./lib/embeddings.js";
import { VectorStore } from "./lib/vectorstore.js";
import { LlmClient } from "./lib/llm-client.js"; // OpenRouter client

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","x-bizchat-session","x-user-id","x-user-name"]
}));
app.use(bodyParser.json({ limit: "16mb" }));

const MODEL = process.env.OPENROUTER_MODEL || "google/gemma-2-9b-it:free";

// very tiny in-memory session store
const sessions = new Map(); // sid -> { history: [], greeted: false }

let store = new VectorStore();
let embedder = await Embedding.boot();
let llm = new LlmClient({ model: MODEL });

app.get("/bizchat/health", (req, res) => res.json({ ok: true }));

app.post("/bizchat/ingest", async (req, res) => {
  const docs = Array.isArray(req.body.docs) ? req.body.docs : [];
  const chunks = [];
  for (const d of docs) {
    if (!d?.text) continue;
    const parts = d.text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    parts.forEach((t, i) => chunks.push({ id: `${d.id}#${i}`, title: d.title, url: d.url, text: t }));
  }
  const vecs = await embedder.embedMany(chunks.map(c => c.text));
  store = new VectorStore(); // reset
  store.addMany(vecs, chunks);
  res.json({ ok: true, chunks: chunks.length });
});

app.post("/bizchat/ask", async (req, res) => {
  try {
    const sid = String(req.body.sessionId || req.get("x-bizchat-session") || "anon");
    const user = req.body.user || {}; // { id, name, email }
    const sess = sessions.get(sid) || { history: [], greeted: false };
    sessions.set(sid, sess);

    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ error: "Missing question" });

    if (store.size() === 0) {
      return res.json({
        answer: "Our AI index isn’t ready yet. Please email Furnitune@jameyl.com or call 123-323-312 for help."
      });
    }

    const qv = await embedder.embedOne(question);
    const hits = store.search(qv, req.body.k ?? 6);
    const context = hits.map((h, i) => `[#${i+1}] ${h.item.text}`).join("\n\n");

    const greetOnce = (!sess.greeted && user.name) ? `Start by saying "Hi ${user.name}!" once, then avoid re-greeting.` : "";
    const system =
      `You are a helpful sales assistant for Furnitune. Answer ONLY using the provided context.\n` +
      `If the answer isn't in context, say you don’t know and suggest emailing Furnitune@jameyl.com or calling 123-323-312.\n` +
      greetOnce;

    const prompt = `${system}\n\nContext:\n${context}\n\nUser: ${question}\nAssistant:`;

    const answer = await llm.complete(prompt, { temperature: 0.2 });
    if (!sess.greeted && user.name) sess.greeted = true;

    const final = String(answer || "").trim();
    res.json({ answer: final || "Sorry — I don’t have that info right now. Please email Furnitune@jameyl.com or call 123-323-312." });
  } catch (e) {
    res.status(200).json({
      answer: "Sorry — I couldn’t fetch that right now. Please email Furnitune@jameyl.com or call 123-323-312."
    });
  }
});

const PORT = process.env.PORT || 7861;

app.listen(PORT, () => {
  console.log(`bizchat up on :${PORT}`);

  // (optional) tiny debug endpoint so you can see if the index has vectors
  app.get("/bizchat/debug/stats", (req, res) => {
    try { res.json({ size: store.size() }); }
    catch { res.json({ size: 0 }); }
  });

  // 🔹 Auto-seed on boot if env var is set
  if (process.env.BIZCHAT_AUTOSEED === "1") {
    import("./scripts/ingest-from-docx.mjs")
      .then(() => console.log("Auto-seed complete"))
      .catch(err => console.error("Auto-seed error:", err));
  }
  });
