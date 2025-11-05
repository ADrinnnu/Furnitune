// src/web/scripts/dev-reco.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const root = process.cwd();
const argPath = process.argv[2];              // optional: node scripts/dev-reco.js ../backend/recommender
const envPath = process.env.RECO_PATH;        // optional: RECO_PATH=../backend/recommender

const candidates = [argPath, envPath, "../backend/recommender", "reco_server", "../reco_server"]
  .filter(Boolean)
  .map((p) => path.resolve(root, p));

const exists = (p) => {
  try { fs.accessSync(p); return true; } catch { return false; }
};

const findApp = (dir) => {
  if (!dir) return null;
  const app = path.join(dir, "app.py");
  return exists(app) ? { dir, app } : null;
};

const findPython = (dir) => {
  const venv = [
    path.join(dir, ".venv", "Scripts", "python.exe"),
    path.join(dir, "venv", "Scripts", "python.exe"),
    path.join(dir, ".venv", "bin", "python"),
    path.join(dir, "venv", "bin", "python"),
  ].find(exists);
  if (venv) return venv;
  if (process.env.RECO_PY) return process.env.RECO_PY;
  return process.platform === "win32" ? "python" : "python3";
};

let chosen = null;
for (const d of candidates) {
  const hit = findApp(d);
  if (hit) { chosen = hit; break; }
}

if (!chosen) {
  console.error("ERROR: Could not find app.py. Checked:");
  candidates.forEach((c) => console.error(" -", c));
  console.error('Tip: pass a path  ->  node ./scripts/dev-reco.js "..\\backend\\recommender"');
  console.error('     or set env   ->  set RECO_PATH="..\\backend\\recommender"');
  process.exit(1);
}

// --- load backend .env (so Python gets GCP_PROJECT/GCS_BUCKET/etc.) ----------
const envFiles = [
  path.join(chosen.dir, ".env.local"),
  path.join(chosen.dir, ".env"),
].filter(exists);

for (const f of envFiles) {
  const res = dotenv.config({ path: f });
  if (res.error) console.warn("[reco] .env load error:", res.error);
}

const PY = findPython(chosen.dir);

// Force UTF-8 so Python prints don’t crash on Windows consoles.
// Ensure PORT has a default (Vite waits on tcp:5000).
const env = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PORT: process.env.PORT || "5000",
};

console.log(`[reco] dir: ${chosen.dir}`);
console.log(`[reco] py : ${PY}`);
console.log(`[reco] PORT=${env.PORT}  GCP_PROJECT=${env.GCP_PROJECT || "<unset>"}  GCS_BUCKET=${env.GCS_BUCKET || "<unset>"}`);

console.log("Starting recommender at", chosen.app);
const child = spawn(PY, [chosen.app], {
  cwd: chosen.dir,
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => process.exit(code ?? 1));
