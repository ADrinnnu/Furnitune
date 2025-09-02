import React, { useState } from "react";

const API = import.meta.env.VITE_RECOMMENDER_BASE_URL || "http://127.0.0.1:5000";

function fileToBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data: prefix
    reader.readAsDataURL(file);
  });
}

export default function Recommender() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");

    const image_b64 = file ? await fileToBase64(file) : null;

    try {
      const res = await fetch(`${API}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image_b64, k: 3 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setErr(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container section">
      <h2>Recommender</h2>

      <form onSubmit={handleSearch} style={{display:"grid", gap:12, maxWidth:520}}>
        <input
          value={text}
          onChange={(e)=>setText(e.target.value)}
          placeholder="Describe what you want (e.g., modern gray sofa)"
        />
        <input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files[0])} />
        <button type="submit" disabled={loading}>{loading ? "Finding..." : "Recommend"}</button>
        {err && <div style={{color:"crimson"}}>{err}</div>}
      </form>

      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16, marginTop:20}}>
        {results.map((p) => (
          <div key={p.id} className="pcard" style={{border:"1px solid #eee", borderRadius:12, overflow:"hidden"}}>
            <div className="pcard-thumb" style={{aspectRatio:"4/3", overflow:"hidden"}}>
              <img src={p.images?.[0]} alt={p.title || p.name} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
            </div>
            <div className="pcard-body" style={{padding:12}}>
              <div style={{opacity:.6, fontSize:12}}>{p.type}</div>
              <div style={{fontWeight:600}}>{p.title || p.name}</div>
              {p.basePrice || p.price ? (
                <div>₱{Number(p.basePrice || p.price).toFixed(2)}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
