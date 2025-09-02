export async function recommend({ text, imageBase64, k = 3 }) {
  const url = import.meta.env.VITE_RECO_URL + "/recommend";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, image_b64: imageBase64, k }),
  });
  if (!res.ok) throw new Error("Recommender failed");
  return res.json(); // { results: [ full product docs ] }
}
