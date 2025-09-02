// web/src/services/recommenderApi.js
const API_BASE =
  (import.meta.env.VITE_RECO_API && import.meta.env.VITE_RECO_API.trim()) || "/reco";

console.log("[Recommender] API base =", API_BASE); // should print the full http://127.0.0.1:5000/reco

export async function health() {
  const res = await fetch(`${API_BASE}/health`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Health HTTP ${res.status}`);
  return res.json();
}

export async function recommend({ image_b64, text, k = 3 }) {
  const res = await fetch(`${API_BASE}/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_b64, text, k }),
  });
  if (!res.ok) throw new Error(`Recommender HTTP ${res.status}`);
  return res.json();
}
