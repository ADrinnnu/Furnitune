import React, { useEffect, useState } from "react";

// If you run through the Vite proxy, leave this as "/reco".
// If you want to hit Flask directly, set VITE_RECO_API in .env (e.g. http://127.0.0.1:5000/reco)
const API_BASE = (import.meta.env.VITE_RECO_API || "/reco").replace(/\/+$/, "");

export default function Recommender() {
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState("");   // optional text
  const [k, setK] = useState(3);              // how many results
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [health, setHealth] = useState(null); // "ok" / "offline" / HTTP #

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/debug/health`);
        setHealth(r.ok ? "ok" : `HTTP ${r.status}`);
      } catch {
        setHealth("offline");
      }
    })();
  }, []);

  const toBase64 = (f) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        resolve(s.includes(",") ? s.split(",")[1] : s);
      };
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  const handleRecommend = async () => {
    setError("");
    setResults([]);

    // We only need ONE of image or text:
    if (!file && !prompt.trim()) {
      setError("Add an image or enter a text query.");
      return;
    }

    setBusy(true);
    try {
      const body = { k: Math.max(1, Math.min(10, Number(k) || 3)) };
      if (file) body.image_b64 = await toBase64(file);
      if (prompt.trim()) body.text = prompt.trim();

      const res = await fetch(`${API_BASE}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t}`);
      }

      const data = await res.json().catch(() => {
        throw new Error("Backend did not return JSON.");
      });

      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Recommender failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section" style={{ minHeight: 360 }}>
      <h2>Recommender</h2>

      <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.8 }}>
        API base: <code>{API_BASE}</code>{" "}
        {health && (
          <span style={{ marginLeft: 8 }}>
            • health:{" "}
            <span style={{ color: health === "ok" ? "green" : "crimson" }}>
              {health}
            </span>
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {/* Text is optional */}
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Optional: 'dark fabric chaise sofa'"
          style={{ flex: "0 0 380px" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          k
          <input
            type="number"
            min={1}
            max={10}
            value={k}
            onChange={(e) => setK(e.target.value)}
            style={{ width: 60 }}
          />
        </label>
        <button onClick={handleRecommend} disabled={busy}>
          {busy ? "Finding..." : "Recommend"}
        </button>
      </div>

      <ul style={{ marginTop: 16 }}>
        {results.map((p) => (
          <li key={p.id || p.slug || p.name}>
            <strong>{p.slug || p.name || p.id}</strong>
            {/* If backend ever attaches a score, show it */}
            {typeof p.score === "number" && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                score: {p.score.toFixed(3)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
