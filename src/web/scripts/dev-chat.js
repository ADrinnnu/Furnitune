// src/web/scripts/dev-chat.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const argPath = process.argv[2];
const envPath = process.env.CHAT_PATH;

const candidates = [
  argPath,
  envPath,
  "./server",
  "../backend/chatbot",
].filter(Boolean).map(p => path.resolve(root, p));

function hasIndex(dir) {
  if (!dir) return null;
  const idx = path.join(dir, "index.js");
  return fs.existsSync(idx) ? { dir, idx } : null;
}

let chosen = null;
for (const d of candidates) {
  const hit = hasIndex(d);
  if (hit) { chosen = hit; break; }
}

if (!chosen) {
  console.error("❌ Could not find chatbot index.js. Checked:");
  candidates.forEach(c => console.error(" -", c));
  process.exit(1);
}

// Pin the port we want during dev (change here if you prefer another port)
const PORT = process.env.BIZCHAT_PORT || process.env.PORT || "7861";

const env = {
  ...process.env,
  // Make the Node server bind to our chosen port:
  PORT,
  // Make the seeder post to that same port:
  BIZCHAT_HOST: `http://localhost:${PORT}`,
  // Keep auto-seed enabled in dev:
  BIZCHAT_AUTOSEED: process.env.BIZCHAT_AUTOSEED ?? "1",
};

console.log("▶️  Starting BizChat in", chosen.dir, "on port", PORT);
const child = spawn(
  process.platform === "win32" ? "node.exe" : "node",
  [chosen.idx],
  { cwd: chosen.dir, stdio: "inherit", shell: true, env }
);
child.on("exit", code => process.exit(code ?? 1));
