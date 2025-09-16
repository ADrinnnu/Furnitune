
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import "../FloatingRobot.css";

const API_BASE = (import.meta.env.VITE_RECO_API || "/reco").replace(/\/+$/, "");


const PANEL_CSS = `
.mini-panel{position:fixed;right:22px;bottom:84px;width:420px;max-width:calc(100vw - 24px);
  height:620px;max-height:calc(100vh - 120px);background:#f8f5ee;border:1px solid #dcd5c7;border-radius:22px;overflow:hidden;
  box-shadow:0 16px 40px rgba(0,0,0,.22);z-index:9999;display:flex;flex-direction:column;transform:translateY(12px);opacity:0;
  pointer-events:none;transition:.18s ease;}
.mini-panel.open{transform:translateY(0);opacity:1;pointer-events:auto}
.topbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #ddd5c6;background:#eef0ec}
.brand{display:flex;flex-direction:column;line-height:1.1}
.brand .big{font-weight:900;letter-spacing:.08em;color:#2c3e37}
.brand .small{font-size:.74rem;letter-spacing:.1em;color:#5c6a64}
.health{margin-left:auto;font-size:.75rem;color:#2d4739}.health.off{color:crimson}
.close{border:1px solid #cbbfae;border-radius:10px;background:#fff;padding:6px 10px;cursor:pointer;font-weight:800}
.scroll{flex:1;overflow:auto;padding:14px;background:#fbfaf6}
.msg{display:flex;margin:8px 0}.msg.bot{justify-content:flex-start}.msg.user{justify-content:flex-end}
.bubble{padding:12px 14px;background:#fff;border:1px solid #e2d9c7;border-radius:16px;max-width:84%;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.bubble.bot{border-top-left-radius:4px}.bubble.user{background:#e9efe9;border-color:#d0e0d5;border-top-right-radius:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chip{background:#e9e5db;color:#1f2a27;border:1px solid #d8d0c1;font-weight:700;letter-spacing:.04em;padding:8px 10px;border-radius:12px;cursor:pointer;font-size:.9rem}
.thumb{width:170px;height:110px;border-radius:12px;overflow:hidden;border:1px solid #d8d0c1;margin-top:10px}
.thumb img{width:100%;height:100%;object-fit:cover}
.cards{display:grid;gap:10px;margin-top:8px}
.cards.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.card{border:1px solid #e3dccb;border-radius:12px;background:#fff;overflow:hidden}
.card.sm img{height:110px}
.card img{width:100%;height:160px;object-fit:cover;display:block}
.card .body{padding:10px}
.card .title{font-weight:800}
.card .type{font-size:.75rem;color:#4f5b57;letter-spacing:.06em;text-transform:uppercase}
.card .price{font-weight:900;margin-top:4px}
.card .btn{margin-top:6px;width:100%;background:#2d4739;color:#fff;border:none;padding:6px 8px;border-radius:12px;font-weight:800;cursor:pointer;text-align:center;font-size:.88rem}
.compose{display:flex;align-items:center;gap:8px;padding:10px;border-top:1px solid #ddd5c6;background:#f6f3eb}
.icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;border:1px solid #cbbfae;background:#fff;cursor:pointer;font-size:18px}
.input{flex:1;border:1px solid #cbbfae;border-radius:12px;padding:10px 12px;background:#fff}
.send{border:1px solid #2d4739;background:#2d4739;color:#fff;padding:8px 12px;border-radius:12px;font-weight:800;cursor:pointer}
.muted{color:#5c6a64;font-size:.85rem}
`;


const BotBubble = ({ children }) => <div className="msg bot"><div className="bubble bot">{children}</div></div>;
const UserBubble = ({ children }) => <div className="msg user"><div className="bubble user">{children}</div></div>;


const TYPES = ["Bed","Sofa","Table","Chair","Sectional","Ottoman","Bench"];
const TYPE_QUESTIONS = {
  Bed: [
    { key:"bed_material", prompt:"Pick a frame material", options:["Wood frame","Metal frame"] },
    { key:"bed_size", prompt:"What size?", options:["Single","Queen","King","California King"] },
    { key:"bed_drawers", prompt:"Drawers at the bottom?", options:["No drawers","2 drawers","4 drawers"] },
  ],
  Sofa: [
    { key:"sofa_seats", prompt:"How many seats?", options:["1 seater","2 seater","3 seater","4 seater","5 seater"] },
    { key:"sofa_upholstery", prompt:"Upholstery", options:["Fabric","Leather"] },
    { key:"sofa_chaise", prompt:"Chaise configuration?", options:["No chaise","Left chaise","Right chaise"] },
  ],
  Table: [
    { key:"table_shape", prompt:"What shape?", options:["Rectangular","Square","Round"] },
    { key:"table_size", prompt:"Choose size", options:["2 people","4 people","6 people","8 people"] },
    { key:"table_material", prompt:"Top/base", options:["Solid wood","Glass top","Wood top + metal base"] },
  ],
  Chair: [
    { key:"chair_style", prompt:"Style", options:["Armless","With arms"] },
    { key:"chair_size", prompt:"Seat height", options:["Standard","Counter","Bar"] },
    { key:"chair_finish", prompt:"Finish", options:["Wood","Fabric","Leather"] },
  ],
  Sectional: [
    { key:"sec_orient", prompt:"Orientation", options:["L-Left","L-Right","U-shaped"] },
    { key:"sec_seats", prompt:"Seats", options:["3 seater","5 seater","6 seater","7 seater"] },
    { key:"sec_upholstery", prompt:"Upholstery", options:["Fabric","Leather"] },
  ],
  Ottoman: [
    { key:"ott_type", prompt:"Type", options:["Standard","Cube","Footstool","Cocktail"] },
    { key:"ott_cover", prompt:"Cover", options:["Fabric","Leather"] },
  ],
  Bench: [
    { key:"bench_length", prompt:"Length", options:["2 seater","3 seater","4 seater"] },
    { key:"bench_place", prompt:"Where to use?", options:["Indoor","Outdoor"] },
  ],
};


const TYPE_ALIASES = {
  bed: ["bed","beds"],
  sofa: ["sofa","sofas","couch","couches"],
  table: ["table","tables","dining table","coffee table"],
  chair: ["chair","chairs","armchair","dining chair","stool","stools"],
  sectional: ["sectional","sectionals"],
  ottoman: ["ottoman","ottomans","footstool","pouf"],
  bench: ["bench","benches"],
};
const str = (v) => (v ?? "").toString().toLowerCase();
function itemLooksLikeType(item, type) {
  const want = (TYPE_ALIASES[type.toLowerCase()] || [type.toLowerCase()]);
  const hay = [
    item.type, item.baseType, item.category, item.productType,
    item.title, item.name, item.slug,
  ].filter(Boolean).map(str).join(" ");
  return want.some(w => hay.includes(w));
}

export default function FloatingRobot() {
 
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const wrapRef = useRef(null);
  const loc = useLocation();

  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY % 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (!wrapRef.current) return; if (!wrapRef.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onEsc); };
  }, [open]);

 
  const [recoOpen, setRecoOpen] = useState(false);
  const [recoInitialized, setRecoInitialized] = useState(false);
  const [recoHealth, setRecoHealth] = useState(null);
  const [recoBusy, setRecoBusy] = useState(false);
  const [recoError, setRecoError] = useState("");
  const [recoMessages, setRecoMessages] = useState([]); 
  const [recoImage, setRecoImage] = useState(null);     
  const [recoType, setRecoType] = useState("");
  const [recoAnswers, setRecoAnswers] = useState({});
  const [recoQIndex, setRecoQIndex] = useState(0);
  const recoFileRef = useRef(null);
  const recoScrollRef = useRef(null);

 
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqMessages, setFaqMessages] = useState([]);
  const [faqInput, setFaqInput] = useState("");
  const faqScrollRef = useRef(null);

 
  useEffect(() => {
    window.FurnituneFAQ = { open: () => setFaqOpen(true), close: () => setFaqOpen(false), toggle: () => setFaqOpen(v=>!v) };
    return () => { delete window.FurnituneFAQ; };
  }, []);

 
   useEffect(() => {
    window.FurnituneReco = {
      open: () => {
        setRecoOpen(true);
        setRecoInitialized(false);
        setRecoType("");
        setRecoAnswers({});
        setRecoQIndex(0);
        setRecoImage(null);
        setRecoMessages([]);
      },
      close: () => setRecoOpen(false),
      toggle: () => setRecoOpen(v => !v)};
    return () => { delete window.FurnituneReco; };
  }, []);


  useEffect(() => {
    if (!recoOpen || recoHealth) return;
    (async () => {
      try { const r = await fetch(`${API_BASE}/debug/health`); setRecoHealth(r.ok ? "ok" : `HTTP ${r.status}`); }
      catch { setRecoHealth("offline"); }
    })();
  }, [recoOpen, recoHealth]);

  useEffect(() => {
    if (!recoOpen || recoInitialized) return;
    setRecoInitialized(true);
    setRecoMessages([
      { role:"bot", text:"Hello! I’m your furniture recommender 💡" },
      { role:"bot", text:"Would you like to upload a photo of your room? I can tailor suggestions from it.", chips:["📷 Upload photo","Skip for now"] },
    ]);
  }, [recoOpen, recoInitialized]);

 
  useEffect(() => {
    if (recoScrollRef.current) recoScrollRef.current.scrollTop = recoScrollRef.current.scrollHeight;
  }, [recoMessages, recoError, recoBusy]);
  useEffect(() => {
    if (faqScrollRef.current) faqScrollRef.current.scrollTop = faqScrollRef.current.scrollHeight;
  }, [faqMessages]);

 
  const addRecoMsg = (m) => setRecoMessages(prev => [...prev, m]);
  function recoAskType(){ addRecoMsg({ role:"bot", text:"What type of furniture do you want?", chips:TYPES }); }
  function recoAskNext(type, idx){ const q=(TYPE_QUESTIONS[type]||[])[idx]; if(q) addRecoMsg({ role:"bot", text:q.prompt, chips:q.options }); }
  function recoBuildQuery(type, a){ const bits=[type, ...Object.values(a)]; return bits.join(", "); }
  const toBase64 = (file) => new Promise((res, rej)=>{ const r=new FileReader(); r.onload=()=>{ const s=String(r.result||""); res(s.includes(",")?s.split(",")[1]:s); }; r.onerror=rej; r.readAsDataURL(file); });

 
  async function recommendBest(type, allAnswers) {
    if (recoHealth && recoHealth !== "ok") { addRecoMsg({ role:"bot", text:"Hmm, the recommender service looks offline right now. Please try again later." }); return; }
    setRecoError(""); setRecoBusy(true);

    addRecoMsg({ role:"bot", text:"Got it! Let me find the best match for you…" });

    try {
      const body = { k: 8, text: `${type}, ${recoBuildQuery(type, allAnswers)}` };
      if (recoImage?.file) body.image_b64 = await toBase64(recoImage.file);

      const res = await fetch(`${API_BASE}/recommend`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let items = Array.isArray(data.results) ? data.results : [];

     
      let sameType = items.filter(it => itemLooksLikeType(it, type));

     
      if (sameType.length > 0) {
        const exact = sameType[0];
        addRecoMsg({ role:"bot", text:"Here’s the best match from our catalog:" });
        addRecoMsg({ role:"bot", product: exact });
      } else {
       
        const res2 = await fetch(`${API_BASE}/recommend`, {
          method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ k: 6, text: type })
        });
        const data2 = await res2.json();
        sameType = (Array.isArray(data2.results) ? data2.results : []).filter(it => itemLooksLikeType(it, type));

        addRecoMsg({
          role:"bot",
          text:`I couldn’t find a perfect ${type.toLowerCase()} that fits those preferences. Here are some related ${type.toLowerCase()}s:`
        });
        addRecoMsg({ role:"bot", cards: sameType.slice(0, 4) });
      }

      addRecoMsg({ role:"bot", text:"Want to adjust anything?", chips:["Change type","Start over"] });
    } catch (e) {
      setRecoError(e.message || "Recommender failed");
      addRecoMsg({ role:"bot", text:"Sorry — I couldn’t fetch a recommendation right now." });
    } finally {
      setRecoBusy(false);
    }
  }

 
  function onRecoChipClick(label){
    if (label === "Change type"){ setRecoType(""); setRecoAnswers({}); setRecoQIndex(0); addRecoMsg({role:"bot", text:"Okay—what type would you like?"}); recoAskType(); return; }
    if (label === "Start over"){
      setRecoType(""); setRecoAnswers({}); setRecoQIndex(0); setRecoImage(null);
      setRecoMessages([
        { role:"bot", text:"Okay, starting fresh." },
        { role:"bot", text:"Would you like to upload a photo of your room?", chips:["📷 Upload photo","Skip for now"] },
      ]);
      return;
    }

    if (label === "📷 Upload photo"){
      addRecoMsg({ role:"user", text:"Upload photo" });
      addRecoMsg({ role:"bot", text:"Choose a photo from your device, or tap Skip for now.", chips:["📷 Upload photo","Skip for now"] });
      if (recoFileRef.current) recoFileRef.current.value = "";
      recoFileRef.current?.click();
      return;
    }
    if (label === "Skip for now"){ addRecoMsg({ role:"user", text:"Skip photo" }); recoAskType(); return; }

    if (TYPES.includes(label)){ setRecoType(label); addRecoMsg({ role:"user", text:label }); setRecoAnswers({}); setRecoQIndex(0); recoAskNext(label,0); return; }

    if (recoType){
      const qs = TYPE_QUESTIONS[recoType] || [];
      const q = qs[recoQIndex];
      if (q){
        setRecoAnswers(a=>({ ...a, [q.key]: label }));
        addRecoMsg({ role:"user", text:label });
        const next = recoQIndex + 1;
        if (next < qs.length){ setRecoQIndex(next); recoAskNext(recoType,next); }
        else { recommendBest(recoType, { ...recoAnswers, [q.key]: label }); }
      }
    }
  }

  function onRecoFilePicked(e){
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setRecoImage({ file:f, url });
    addRecoMsg({ role:"bot", text:"Nice! I’ll use your photo to refine the recommendation.", imageUrl:url });
    recoAskType();
  }

 
  const CONTACT = { phone:"123-323-312", email:"Furnitune@jameyl.com", live:"Offline now" };
  const FAQS = [
    { q:"What is Furnitune?", a:"Furnitune is an e-commerce platform for Santos Upholstery offering ready-made products, customization, repairs, an AI recommender, and an FAQ chatbot.", tags:["general"] },
    { q:"How does the recommender system work?", a:"It analyzes your room photo and preferences, encodes them, then finds the closest matches in our catalog.", tags:["recommender","ai"] },
    { q:"What can I customize?", a:"Request custom furniture (dimensions, materials, colors) and add reference images.", tags:["customization"] },
    { q:"Do you accept furniture repair requests?", a:"Yes—even for items not purchased from us. Submit photos and details for assessment.", tags:["repairs"] },
  ];
  function faqBoot(){ setFaqMessages([{role:"bot",text:"Hi! I’m your Furnitune assistant. What can I help you with?"},{role:"bot",text:"Pick a quick question below, or type your own:",chips:FAQS.map(x=>x.q)}]); }
  useEffect(()=>{ if(faqOpen && faqMessages.length===0) faqBoot(); },[faqOpen]); 
  function answerFor(s0){ const s=s0.trim().toLowerCase(); if(/call|phone|number|contact/.test(s)) return `You can call us at ${CONTACT.phone}.`; if(/email|mail/.test(s)) return `You can email us at ${CONTACT.email}.`; if(/chat|live/.test(s)) return `Live Chat is ${CONTACT.live}.`; const d=FAQS.find(f=>f.q.toLowerCase()===s); if(d) return d.a; const c=FAQS.find(f=> (f.q+" "+(f.tags||[]).join(" ")).toLowerCase().includes(s)); return c?c.a:"I’m not sure yet. Try one of the quick questions above.";}
  function onFaqChip(q){ setFaqMessages(p=>[...p,{role:"user",text:q},{role:"bot",text:answerFor(q)}]); }
  function onSendFaq(){ const msg=faqInput.trim(); if(!msg) return; setFaqInput(""); setFaqMessages(p=>[...p,{role:"user",text:msg},{role:"bot",text:answerFor(msg)}]); }

  return (
    <>
      <style>{PANEL_CSS}</style>

      {/* Floating FAB */}
      <div ref={wrapRef} className="fab-wrap" style={{ transform:`translateY(${offset*0.2}px)` }}>
        <button type="button" className="fab-robot" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="fab-menu">🤖</button>
        {open && (
          <div id="fab-menu" className="fab-menu" role="menu">
            <button type="button" className="fab-item" role="menuitem" title="FAQ Chatbot" onClick={()=>{setFaqOpen(true);setOpen(false);}}>💬</button>
            <button type="button" className="fab-item" role="menuitem" title="Recommender" onClick={()=>{
              setRecoOpen(true); setOpen(false);
              setRecoInitialized(false); setRecoType(""); setRecoAnswers({}); setRecoQIndex(0);
              setRecoImage(null); setRecoMessages([]);
            }}>✨</button>
          </div>
        )}
      </div>

      {/* FAQ Panel */}
      <div className={`mini-panel ${faqOpen ? "open" : ""}`} aria-hidden={!faqOpen}>
        <div className="topbar"><div className="brand"><div className="big">FURNITUNE</div><div className="small">FAQ Chatbot</div></div>
          <button className="close" onClick={()=>setFaqOpen(false)}>Close</button></div>
        <div className="scroll" ref={faqScrollRef}>
          {faqMessages.map((m,i)=> m.role==="user"
            ? <UserBubble key={i}>{m.text}</UserBubble>
            : <BotBubble key={i}>
                <div>{m.text}</div>
                {m.chips?.length ? <div className="chips">{m.chips.map(c=><button key={c} className="chip" onClick={()=>onFaqChip(c)}>{c}</button>)}</div> : null}
              </BotBubble>
          )}
        </div>
        <div className="compose">
          <input className="input" value={faqInput} placeholder="Ask a question…" onChange={(e)=>setFaqInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&onSendFaq()}/>
          <button className="send" onClick={onSendFaq}>Send</button>
        </div>
      </div>

      {/* Recommender Panel */}
      <div className={`mini-panel ${recoOpen ? "open" : ""}`} aria-hidden={!recoOpen}>
        <div className="topbar">
          <div className="brand"><div className="big">FURNITUNE</div><div className="small">Recommender</div></div>
          <div className={`health ${recoHealth==="ok"?"":"off"}`}>• {recoHealth || "…"}</div>
          <button className="close" onClick={()=>setRecoOpen(false)}>Close</button>
        </div>

        <div className="scroll" ref={recoScrollRef}>
          {recoMessages.map((m,i)=>
            m.role==="user" ? (
              <UserBubble key={i}>{m.text}</UserBubble>
            ) : (
              <BotBubble key={i}>
                <div>{m.text}</div>
                {m.imageUrl && <div className="thumb" style={{marginTop:8}}><img src={m.imageUrl} alt="uploaded room"/></div>}
                {m.product && (
                  <div className="card" style={{marginTop:8}}>
                    {(() => {
                      const p=m.product; const img=Array.isArray(p.images)?p.images[0]:p.images?.url||p.image;
                      return img ? <img src={img} alt={p.title||p.name||"Product"}/> : null;
                    })()}
                    <div className="body">
                      {!!(m.product.type||m.product.baseType) && <div className="type">{m.product.type||m.product.baseType}</div>}
                      <div className="title">{m.product.title||m.product.name||m.product.slug||"Product"}</div>
                      {(m.product.price!=null || m.product.basePrice!=null) && <div className="price">₱{Number(m.product.price ?? m.product.basePrice ?? 0).toFixed(2)}</div>}
                      <a className="btn" href={`/product/${m.product.id}`}>View</a>
                    </div>
                  </div>
                )}
                {m.cards?.length>0 && (
                  <div className="cards two">
                    {m.cards.map((it,idx)=>(
                      <div className="card sm" key={idx}>
                        {(() => {
                          const img=Array.isArray(it.images)?it.images[0]:it.images?.url||it.image;
                          return img ? <img src={img} alt={it.title||it.name||"Product"}/> : null;
                        })()}
                        <div className="body">
                          {!!(it.type||it.baseType) && <div className="type">{it.type||it.baseType}</div>}
                          <div className="title">{it.title||it.name||it.slug||"Product"}</div>
                          {(it.price!=null || it.basePrice!=null) && <div className="price">₱{Number(it.price ?? it.basePrice ?? 0).toFixed(2)}</div>}
                          <a className="btn" href={`/product/${it.id}`}>View</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {m.chips?.length ? <div className="chips">{m.chips.map(c=><button key={c} className="chip" onClick={()=>onRecoChipClick(c)}>{c}</button>)}</div> : null}
              </BotBubble>
            )
          )}
          {recoBusy && <BotBubble><span className="muted">Searching…</span></BotBubble>}
          {recoError && <BotBubble><span style={{color:"crimson"}}>{recoError}</span></BotBubble>}
        </div>

        <div className="compose">
          <button className="icon" onClick={()=>{if(recoFileRef.current) recoFileRef.current.value=""; recoFileRef.current?.click();}} title="Upload a room/photo">📷</button>
          <input ref={recoFileRef} type="file" accept="image/*" hidden onChange={onRecoFilePicked}/>
          <input className="input" value="" placeholder="Use the buttons above to answer…" disabled/>
          <button className="send" disabled>Send</button>
        </div>
      </div>
    </>
  );
}
