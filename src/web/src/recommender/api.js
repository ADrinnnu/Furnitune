// src/recommender/api.js
export async function recommend({ text, imageBase64, type, size, color, minBudget, maxBudget, k = 3 }) {
  const url = import.meta.env.VITE_RECO_URL + "/recommend";
  
  const payload = {
    text,
    image_b64: imageBase64,
    type,
    size,
    color,
    min_budget: minBudget ? Number(minBudget) : null,
    max_budget: maxBudget ? Number(maxBudget) : null,
    k
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Recommender failed to fetch results.");
  return res.json(); 
}