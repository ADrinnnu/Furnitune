import React from "react";
import { useParams } from "react-router-dom";
import { getProduct } from "../data/products.js";
import { useCart } from "../state/CartContext.jsx";

const FABRICS = [
  { id: "marble",  label: "Marble",    swatch: "#d9d3c7" },
  { id: "terra",   label: "Terracotta",swatch: "#b86a52" },
  { id: "cement",  label: "Cement",    swatch: "#6f6f6f" },
  { id: "harbour", label: "Harbour",   swatch: "#2c3e50" },
];

export default function ProductDetail() {
  const { id } = useParams();
  const product = getProduct(id);
  const { add } = useCart();
  const [fabric, setFabric] = (FABRICS[0].id);

  if (!product) {
    return <div className="container section"><h2>Product not found.</h2></div>;
  }

  const { title, price, type, thumb, images = [], rating, reviews } = product;

  return (
    <div className="container section" style={{display:"grid", gridTemplateColumns:"minmax(280px, 1fr) 420px", gap:24}}>
      {/* Left: big image + gallery + description + dimensions */}
      <div>
        <div className="round card" style={{padding:0, overflow:"hidden", background:"#8aa397"}}>
          {thumb ? <img src={thumb} alt={title} style={{width:"100%", display:"block"}}/> : <div style={{height:360, display:"grid", placeItems:"center", color:"#2e3c38", fontWeight:700}}>{type}</div>}
        </div>

        {/* small gallery */}
        <div style={{display:"flex", gap:10, margin:"10px 0 16px"}}>
          {[thumb, ...images].filter(Boolean).slice(0,6).map((src, idx) => (
            <div key={idx} style={{width:72, height:54, overflow:"hidden", borderRadius:8, background:"#8aa397"}}>
              <img src={src} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/>
            </div>
          ))}
        </div>

        {/* description & dimensions placeholders – your copy here */}
        <div className="card" style={{marginBottom:16}}>
          <h3 style={{margin:"0 0 8px"}}>DESCRIPTION</h3>
          <p className="muted">hahahasdasdasdas</p>
        </div>

        <div className="card">
          <h3 style={{margin:"0 0 8px"}}>DIMENSIONS</h3>
          <p className="muted">Width x Depth x Height details, diagrams or images.</p>
        </div>
      </div>

      {/* Right: summary + options + add to cart */}
      <div>
        <div className="card" style={{padding:18}}>
          <div className="muted" style={{textTransform:"uppercase", letterSpacing:".08em"}}>{type}</div>
          <h2 style={{margin:"4px 0 6px"}}>{title}</h2>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
            <span>{"★★★★★".slice(0, rating)}{"☆☆☆☆☆".slice(rating)}</span>
            <span className="muted"> {reviews} Reviews</span>
          </div>
          <div style={{fontWeight:900, fontSize:24, marginBottom:12}}>₱{price.toFixed(2)}</div>

          {/* 1. Choose fabric (placeholders) */}
          <aside className="repair-right">
          <div className="card1">
            <div className="card-title">1 - Choose Fabric</div>
            <div className="swatches">
              {FABRICS.map((f) => (
                <button
                  key={f.id}
                  className={`swatch1 ${fabric === f.id ? "active" : ""}`}
                  style={{ background: f.swatch }}
                  onClick={() => setFabric(f.id)}
                />
              ))}
            </div>
            <small>{FABRICS.find((x) => x.id === fabric)?.label}</small>
<hr />
          {/* 2. Choose size (placeholders) */}
          <div style={{margin:"12px 0"}}>
            <div style={{fontWeight:800, fontSize:12, letterSpacing:".1em"}}>2  CHOOSE SIZE</div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8}}>
              {["60\"", "72\"", "76\"", "80\"", "84\"", "90\"", "96\"", "Custom"].map((s)=>(
                <button key={s} className="ghost-btn" style={{padding:"8px 0"}}>{s}</button>
              ))}
            </div>
          </div>
<hr />
          {/* 3. Notes */}
          <div style={{margin:"12px 0"}}>
            <div style={{fontWeight:800, fontSize:12, letterSpacing:".1em"}}>3  DESCRIPTION</div>
            <textarea rows={4} placeholder="Optional notes…" style={{width:"100%", marginTop:8, padding:10, borderRadius:12, border:"1px solid #e6e2d6"}}/>
          </div>

          <div style={{display:"flex", gap:10, marginTop:8}}>
            <button className="btn ghost" style={{flex:"0 0 120px"}}>₱{price.toFixed(2)}</button>
            <button
              className="btn"
              style={{flex:1}}
              onClick={() => add({ id, title, price, type, thumb })}
            >
              Add to cart
            </button>
          </div>
        </div>
        </aside>
      </div>
    </div>
</div>
  );
}

