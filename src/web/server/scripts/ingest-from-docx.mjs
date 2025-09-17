// DOCX -> structured docs -> POST /bizchat/ingest
// Works even without ingest.config.json (uses sensible defaults).

import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional config
let cfg = {};
try {
  const cfgPath = path.join(__dirname, "../seed/ingest.config.json");
  if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (e) {
  console.warn("Could not read ingest.config.json:", e?.message || e);
}

// Defaults
const host = process.env.BIZCHAT_HOST || cfg.host || "http://localhost:7861";
const docxPath = process.env.BIZCHAT_DOCX || cfg.docxPath || path.join(__dirname, "../seed/Furnitune.docx");
const MAX = cfg.maxCharsPerDoc ?? 12000;

const DEFAULT_WHITELIST = [
  "About", "Purpose", "Description", "Objectives",
  "Customization", "Repair", "Recommender", "Chatbot",
  "Ordering", "Payment", "PayMongo", "Delivery", "Tracking",
  "Policies", "Scope and Limitations",
  "Returns", "Refund", "Warranty", "Privacy",
  "Operating Hours", "Coverage", "Contact", "Visit", "FAQ"
];
const DEFAULT_BLACKLIST = [
  "Team", "Peopleware", "Hardware", "Software Requirements",
  "Review of Related Literature", "Methodology", "Sprints",
  "Gantt", "ERD", "Use Case", "Appendix", "References",
  "Story Board", "Figures", "Tables"
];

const WHITE = (cfg.whitelistHeadings || DEFAULT_WHITELIST);
const BLACK = (cfg.blacklistHeadings || DEFAULT_BLACKLIST);
const URL_MAP = cfg.urlMap || {
  "About": "https://your-site/about",
  "Customization": "https://your-site/custom",
  "Repair": "https://your-site/repairs",
  "Recommender": "https://your-site/recommend",
  "Chatbot": "https://your-site/chat",
  "Ordering": "https://your-site/order",
  "Payment": "https://your-site/payment",
  "Delivery": "https://your-site/delivery",
  "Policies": "https://your-site/policies",
  "Returns": "https://your-site/returns",
  "Refund": "https://your-site/returns",
  "Warranty": "https://your-site/warranty",
  "Privacy": "https://your-site/privacy",
  "Contact": "https://your-site/contact",
  "Visit": "https://your-site/visit"
};

const KEEP_OPEN = "[BOT-KEEP]";
const KEEP_CLOSE = "[/BOT-KEEP]";
const SKIP_OPEN = "[BOT-SKIP]";
const SKIP_CLOSE = "[/BOT-SKIP]";

function escRe(s){ return s.replace(/[[\]{}()*+?.\\^$|]/g, "\\$&"); }
function inList(list, text){ return list.some(x => new RegExp(escRe(x), "i").test(text)); }
function idOf(title){ return title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60); }
function stripKeep(t){ return t.replaceAll(KEEP_OPEN, "").replaceAll(KEEP_CLOSE, ""); }

// 1) Read file
if (!fs.existsSync(docxPath)) { console.error("DOCX not found:", docxPath); process.exit(1); }
console.log("Ingesting from:", docxPath);
const { value: raw } = await mammoth.extractRawText({ path: docxPath });

// 2) Remove [BOT-SKIP] blocks
const text = raw.replace(new RegExp(`${escRe(SKIP_OPEN)}[\\s\\S]*?${escRe(SKIP_CLOSE)}`, "g"), "");

// 3) Paragraphs + heading detection
const paras = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
function isHeading(line) {
  if (!line) return false;
  if (/^(Table|Figure)\b/i.test(line)) return false;
  if (/^[A-Z0-9 .:()/-]{6,}$/.test(line) && /[A-Z]/.test(line) && !/[a-z]{3,}/.test(line)) return true;
  if (/^\d+(\.\d+)*\s+/.test(line)) return true;
  if (/^[A-Z][A-Za-z].{3,}$/.test(line) && !line.endsWith(".") && line.split(" ").length <= 10) return true;
  return false;
}
const norm = (h) => h.replace(/^\d+(\.\d+)*\s+/, "").trim();

let sections = [];
let cur = { heading: "Untitled", chunks: [] };
for (const p of paras) {
  if (isHeading(p)) { if (cur.chunks.length) sections.push(cur); cur = { heading: norm(p), chunks: [] }; }
  else cur.chunks.push(p);
}
if (cur.chunks.length) sections.push(cur);

// 4) Build docs
const docs = [];
for (const s of sections) {
  const allow = (WHITE.length ? inList(WHITE, s.heading) : true) && !inList(BLACK, s.heading);
  const body = s.chunks.map(p => (p.includes(KEEP_OPEN) && p.includes(KEEP_CLOSE)) ? stripKeep(p) : (allow ? p : ""))
    .filter(Boolean).join("\n").trim();
  if (body.length > 40) {
    const id = idOf(s.heading);
    const key = Object.keys(URL_MAP).find(k => new RegExp(escRe(k), "i").test(s.heading));
    const url = key ? URL_MAP[key] : `https://your-site/${id}`;
    docs.push({ id, title: s.heading, url, text: body.slice(0, MAX) });
  }
}

// 5) Phrase-based extras
function addIf(name, regexes) {
  const matched = paras.filter(p => regexes.some(rx => rx.test(p)));
  const combined = matched.map(stripKeep).join("\n").trim();
  if (combined.length > 120) docs.push({ id: idOf(name), title: name, url: `https://your-site/${idOf(name)}`, text: combined.slice(0, MAX) });
}
addIf("Returns & Refunds", [/refund/i, /return/i, /replace/i]);
addIf("Warranty", [/warranty/i, /guarantee/i]);
addIf("Data Privacy", [/privacy/i, /data protection/i]);
addIf("Operating Hours & Coverage", [/business hours?/i, /opening/i, /coverage/i, /service area/i]);

// 6) POST to backend
console.log(`Posting ${docs.length} docs to ${host}/bizchat/ingest ...`);
const res = await fetch(`${host}/bizchat/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ docs }),
});
if (!res.ok) {
  console.error("Ingest failed:", res.status, await res.text());
  process.exit(1);
}
const out = await res.json();
console.log("DOCX ingest OK:", docs.length, out);
