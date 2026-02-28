import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_RECOMMENDER_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, '');
const API = API_BASE.endsWith("/reco") ? API_BASE : `${API_BASE}/reco`;

function fileToBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); 
    reader.readAsDataURL(file);
  });
}

export default function Recommender() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [type, setType] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [text, setText] = useState(""); 
  
  // BUDGET STATES RESTORED
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const [results, setResults] = useState([]); 
  const [aiAnalysis, setAiAnalysis] = useState(""); 
  const [customConcepts, setCustomConcepts] = useState([]); 

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    setResults([]);
    setAiAnalysis("");
    setCustomConcepts([]);

    const image_b64 = file ? await fileToBase64(file) : null;

    try {
      const res = await fetch(`${API}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          image_b64,
          type,
          size,
          color,
          min_budget: minBudget ? Number(minBudget) : null, // BUDGET ADDED BACK
          max_budget: maxBudget ? Number(maxBudget) : null, // BUDGET ADDED BACK
          k: 3
        }),
      });

      if (!res.ok) throw new Error("Our AI is currently busy. Please try again.");
      const data = await res.json();

      setResults(data.results || []);

      if (data.ai_designer) {
        setAiAnalysis(data.ai_designer.room_analysis || "");
        setCustomConcepts(data.ai_designer.custom_concepts || []);
      }

    } catch (error) {
      console.error(error);
      setErr(error.message || "Failed to get recommendations.");
    } finally {
      setLoading(false);
    }
  }

  const handleBuildCustom = (concept) => {
      navigate("/Customization");
  };

  return (
    <div className="container section">
      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <h2>✨ AI Interior Designer</h2>
        <p className="muted">Upload your room, set your budget, and let our AI find or design the perfect furniture for you.</p>
      </div>

      <form onSubmit={handleSearch} style={{ display: "grid", gap: 16, maxWidth: 600, margin: "0 auto", background: "#fff", padding: "24px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        
        <div>
          <label style={{ fontSize: "14px", fontWeight: "bold", display: "block", marginBottom: "6px" }}>1. Upload Room Photo (Optional but recommended)</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} style={{ width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: "6px" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Furniture Type*</label>
            <input required value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Sofa, Bed..." style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Preferred Size</label>
            <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 3-Seater, Queen..." style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Preferred Color</label>
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Emerald Green..." style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
          </div>
        </div>

        {/* BUDGET UI RESTORED */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Min Budget (₱)</label>
            <input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} placeholder="5000" style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Max Budget (₱)</label>
            <input type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} placeholder="15000" style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginBottom: "4px" }}>Additional Add-ons / Style Notes</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Needs armrests, mid-century modern style..." style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} />
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          style={{ padding: "12px", background: "#2F6F62", color: "white", fontWeight: "bold", border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer", fontSize: "16px", marginTop: "8px" }}
        >
          {loading ? "Analyzing Room & Searching Catalog..." : "Generate Recommendations"}
        </button>
        {err && <div style={{ color: "crimson", textAlign: "center", fontSize: "14px" }}>{err}</div>}
      </form>

      {(!loading && (results.length > 0 || aiAnalysis)) && (
        <div style={{ marginTop: "40px" }}>
          
          {aiAnalysis && (
            <div style={{ background: "#eef8e9", borderLeft: "5px solid #2F6F62", padding: "20px", borderRadius: "8px", marginBottom: "30px" }}>
              <h3 style={{ color: "#1E2C2B", fontSize: "18px", marginBottom: "10px" }}>🤖 AI Design Analysis</h3>
              <p style={{ color: "#333", fontSize: "15px", lineHeight: "1.6", margin: 0 }}>{aiAnalysis}</p>
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginBottom: "50px" }}>
              <h3 style={{ borderBottom: "2px solid #eee", paddingBottom: "10px", marginBottom: "20px" }}>📦 Ready to Ship (From our Catalog)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
                {results.map((p) => (
                  <div key={p.id} className="pcard" style={{ border: "1px solid #e0e0e0", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
                    <div className="pcard-thumb" style={{ aspectRatio: "4/3", overflow: "hidden", background: "#f5f5f5" }}>
                      <img src={p.images?.[0] || p.image} alt={p.title || p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div className="pcard-body" style={{ padding: 16, display: "flex", flexDirection: "column", flexGrow: 1 }}>
                      <div style={{ opacity: .6, fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>{p.categorySlug || p.type || "FURNITURE"}</div>
                      <div style={{ fontWeight: "bold", fontSize: 16, color: "#111", marginBottom: 8, lineHeight: 1.2 }}>{p.title || p.name}</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#2F6F62", marginTop: "auto", marginBottom: 12 }}>
                        ₱{Number(p.price || p.basePrice || 0).toLocaleString()}
                      </div>
                      
                      <button 
                        onClick={() => navigate(`/product/${p.id || p.slug}`)} 
                        style={{ width: "100%", padding: "10px", background: "#1E2C2B", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
                      >
                        View Product
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customConcepts.length > 0 && (
            <div>
              <h3 style={{ borderBottom: "2px solid #eee", paddingBottom: "10px", marginBottom: "20px" }}>🎨 Custom Styling Inspiration (Build to Order)</h3>
              <p className="muted" style={{ marginBottom: "20px" }}>Don't see exactly what you want? Our AI generated these custom ideas specifically for your space. We can build them for you!</p>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {customConcepts.map((concept, idx) => (
                  <div key={idx} className="pcard" style={{ border: "2px solid #2F6F62", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
                    
                    <div className="pcard-thumb" style={{ aspectRatio: "4/3", overflow: "hidden", background: "#f5f5f5", position: "relative" }}>
                      <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(47, 111, 98, 0.9)", color: "white", padding: "4px 8px", fontSize: "10px", borderRadius: "4px", fontWeight: "bold", zIndex: 10 }}>AI GENERATED CONCEPT</div>
                      {concept.image_url ? (
                        <img src={concept.image_url} alt={concept.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>Image Generating...</div>
                      )}
                    </div>

                    <div className="pcard-body" style={{ padding: 16, display: "flex", flexDirection: "column", flexGrow: 1 }}>
                      <div style={{ opacity: .6, fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>CUSTOM {concept.category || type}</div>
                      <div style={{ fontWeight: "bold", fontSize: 16, color: "#111", marginBottom: 8, lineHeight: 1.2 }}>{concept.title}</div>
                      
                      <p style={{ fontSize: "13px", color: "#555", lineHeight: "1.4", marginBottom: "16px" }}>
                        {concept.description}
                      </p>
                      
                      <div style={{ fontSize: "12px", background: "#f5f5f5", padding: "8px", borderRadius: "6px", marginBottom: "16px" }}>
                        <strong>Suggested Color:</strong> {concept.suggested_color}
                      </div>

                      <button 
                        onClick={() => handleBuildCustom(concept)} 
                        style={{ width: "100%", padding: "10px", background: "#2F6F62", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", marginTop: "auto" }}
                      >
                        Build This Custom
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}