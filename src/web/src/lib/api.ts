// src/web/src/lib/api.ts
const CHAT_BASE = import.meta.env.VITE_CHAT_URL || ""; // empty -> dev proxy used
const RECO_BASE = import.meta.env.VITE_RECO_URL || "";

const url = (base: string, path: string) => (base ? `${base}${path}` : path);

export async function askChat(payload: any) {
  const res = await fetch(url(CHAT_BASE, "/bizchat/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json(); // { answer: "..." }
}

export async function recommend(payload: any) {
  const res = await fetch(url(RECO_BASE, "/reco/recommend"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`reco ${res.status}`);
  return res.json(); // { items: [...], ... }
}
