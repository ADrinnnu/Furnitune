// src/web/scripts/dev-reco.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const argPath = process.argv[2];           // allow explicit path
const envPath = process.env.RECO_PATH;     // or env var

const candidates = [
  argPath,
  envPath,
  "../backend/recommender",                // your repo’s path
  "reco_server",
  "../reco_server",
]
  .filter(Boolean)
  .map((p) => path.resolve(root, p));

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function findApp(dir) {
  if (!dir) return null;
  const app = path.join(dir, "app.py");
  return exists(app) ? { dir, app } : null;
}

function findPython(dir) {
  // Prefer a local venv if available
  const venvCandidates = [
    path.join(dir, ".venv", "Scripts", "python.exe"),
    path.join(dir, "venv", "Scripts", "python.exe"),
    path.join(dir, ".venv", "bin", "python"),
    path.join(dir, "venv", "bin", "python"),
  ];
  const venvPy = venvCandidates.find(exists);
  if (venvPy) return venvPy;

  // Respect override
  if (process.env.RECO_PY) return process.env.RECO_PY;

  // OS defaults
  return process.platform === "win32" ? "python" : "python3";
}

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

const PY = findPython(chosen.dir);

// Force UTF-8 so Python prints don’t crash on Windows consoles.
const env = { ...process.env, PYTHONIOENCODING: "utf-8" };

console.log("Starting recommender at", chosen.app);
const child = spawn(PY, [chosen.app], {
  cwd: chosen.dir,
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => process.exit(code ?? 1));
