import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "../FloatingRobot.css";
import botImg from "../assets/letter-f.png";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

// ---- endpoints ----
const API_BASE = (import.meta.env.VITE_RECO_API || "/reco").replace(/\/+$/, "");
const BIZCHAT_BASE = (import.meta.env.VITE_BIZCHAT_API || "/bizchat").replace(/\/+$/, "");
const RECO_URL = (import.meta.env.VITE_RECO_URL || "/recommender").replace(/\/+$/, "");

// how many recommendations to show
const RECO_K = 2;

// ---- panel styles ----
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
.chip.on{background:#2d4739;color:#fff;border-color:#2d4739}
.thumb{width:170px;height:110px;border-radius:12px;overflow:hidden;border:1px solid #d8d0c1;margin-top:10px}
.thumb img{width:100%;height:100%;object-fit:cover}
.card{border:1px solid #e3dccb;border-radius:12px;background:#fff;overflow:hidden;margin-top:8px}
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

// ---- Questions per type (color options include "None") ----
const TYPES = ["Bed","Sofa","Table","Chair","Sectional","Ottoman","Bench"];

const TYPE_QUESTIONS = {
  Sofa: [
    { key: "size",  prompt: "Size (seats)?", options: ["1 seater","2 seater","3 seater","4 seater","5 seater"] },
    { key: "color", prompt: "What color?",  options: ["Red","White","Black","Brown","None"] },
  ],
  Sectional: [
    { key: "size",  prompt: "Layout / size?", options: ["L-shape small","L-shape large","U-shape"] },
    { key: "color", prompt: "What color?",    options: ["Red","White","Black","Brown","None"] },
  ],
  Chair: [
    { key: "size",  prompt: "Seat height?",   options: ["Standard","Counter","Bar"] },
    { key: "color", prompt: "What color?",    options: ["Red","White","Black","Brown","None"] },
  ],
  Table: [
    { key: "size",  prompt: "Size / seating?", options: ["2 people","4 people","6 people","8 people"] },
  ],
  Bed: [
    { key: "size",  prompt: "Mattress size?", options: ["Single","Double","Queen","King"] },
    { key: "color", prompt: "What color?",    options: ["Red","White","Black","Brown","None"] },
  ],
  Bench: [
    { key: "size",  prompt: "Length?",        options: ["Short","Medium","Long"] },
  ],
  Ottoman: [
    { key: "size",  prompt: "Size?",          options: ["Small","Medium","Large"] },
    { key: "color", prompt: "What color?",    options: ["Red","White","Black","Brown","None"] },
  ],
};

// quick type check for filtering
const TYPE_ALIASES = {
  bed: ["bed","beds"],
  sofa: ["sofa","sofas","couch","couches"],
  table: ["table","tables","dining table","coffee table"],
  chair: ["chair","chairs","armchair","dining chair","stool","stools"],
  sectional: ["sectional","sectionals"],
  ottoman: ["ottoman","ottomans","footstool","pouf"],
};
const str = (v) => (v ?? "").toString().toLowerCase();
function itemLooksLikeType(item, type) {
  const want = (TYPE_ALIASES[type.toLowerCase()] || [type.toLowerCase()]);
  const hay = [
    item.type, item.baseType, item.category, item.productType,
    item.title, item.name, item.slug, item.id,
  ].filter(Boolean).map(str).join(" ");
  return want.some(w => hay.includes(w));
}

// Prefer thumbnail first (backend signs gs:// → https)
const getPrimaryImage = (it) => {
  if (!it) return "";
  if (it.thumbnail) return String(it.thumbnail);
  if (it.imageUrl) return String(it.imageUrl);
  if (it.image) return String(it.image);
  if (Array.isArray(it.images) && it.images.length) return String(it.images[0]);
  if (it.primaryImage) return String(it.primaryImage);
  return "";
};

export default function FloatingRobot() {
  // FAB and panel toggles
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
    const onDocClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // auth
  const [meName, setMeName] = useState("Guest");
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setMeName("Guest"); return; }
      const fallback = u.email ? u.email.split("@")[0] : "Guest";
      setMeName((u.displayName && u.displayName.trim()) || fallback || "Guest");
    });
    return () => unsub();
  }, []);

  // Reco state
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

  // FAQ
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqMessages, setFaqMessages] = useState([]);
  const [faqInput, setFaqInput] = useState("");
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqError, setFaqError] = useState("");
  const faqScrollRef = useRef(null);

  // public APIs on window
  useEffect(() => {
    window.FurnituneFAQ = {
      open: () => setFaqOpen(true),
      close: () => setFaqOpen(false),
      toggle: () => setFaqOpen(v => !v),
    };
    return () => { delete window.FurnituneFAQ; };
  }, []);
  useEffect(() => {
    window.FurnituneReco = {
      open: () => {
        setRecoOpen(true);
        setRecoInitialized(false);
        setRecoType(""); setRecoAnswers({}); setRecoQIndex(0);
        setRecoImage(null); setRecoMessages([]);
      },
      close: () => setRecoOpen(false),
      toggle: () => setRecoOpen(v => !v)
    };
    return () => { delete window.FurnituneReco; };
  }, []);

  // health
  useEffect(() => {
    if (!recoOpen || recoHealth) return;
    (async () => {
      try { const r = await fetch(`${API_BASE}/health`); setRecoHealth(r.ok ? "ok" : `HTTP ${r.status}`); }
      catch { setRecoHealth("offline"); }
    })();
  }, [recoOpen, recoHealth]);

  // boot convo
  useEffect(() => {
    if (!recoOpen || recoInitialized) return;
    setRecoInitialized(true);
    setRecoMessages([
      { role:"bot", text:"Hello! I’m your furniture recommender 💡" },
      { role:"bot", text:"Would you like to upload a photo of your room? I can tailor suggestions from it.", chips:["📷 Upload photo","Skip for now"] },
    ]);
  }, [recoOpen, recoInitialized]);

  // autoscroll
  useEffect(() => { if (recoScrollRef.current) recoScrollRef.current.scrollTop = recoScrollRef.current.scrollHeight; }, [recoMessages, recoError, recoBusy]);
  useEffect(() => { if (faqScrollRef.current) faqScrollRef.current.scrollTop = faqScrollRef.current.scrollHeight; }, [faqMessages, faqBusy, faqError]);

  const addRecoMsg = (m) => setRecoMessages(prev => [...prev, m]);
  const recoAskType = () => addRecoMsg({ role:"bot", text:"What type of furniture do you want?", chips:TYPES });

  const recoAskNext = (type, idx) => {
    const q=(TYPE_QUESTIONS[type]||[])[idx];
    if(!q) return;
    const chips = q.multi ? [...q.options, "Done"] : q.options;
    addRecoMsg({ role:"bot", text:q.prompt, chips, qKey:q.key, multi:!!q.multi });
  };

  const recoBuildQuery = (type, a) => {
    const parts = [type];
    if (a.size) parts.push(String(a.size));
    if (a.color) parts.push(String(a.color));
    if (Array.isArray(a.additionals) && a.additionals.length) parts.push(a.additionals.join(" "));
    return parts.join(", ");
  };

  const toBase64 = (file) => new Promise((res, rej)=>{ const r=new FileReader(); r.onload=()=>{ const s=String(r.result||""); res(s.includes(",")?s.split(",")[1]:s); }; r.onerror=rej; r.readAsDataURL(file); });

  async function recommendBest(type, allAnswers) {
    if (recoHealth && recoHealth !== "ok") {
      addRecoMsg({ role:"bot", text:"Hmm, the recommender service looks offline right now. Please try again later." });
      return;
    }
    setRecoError(""); setRecoBusy(true);
    addRecoMsg({ role:"bot", text:"Got it! Let me find the best match for you…" });

    try {
      const body = {
        k: RECO_K,
        text: `${recoBuildQuery(type, allAnswers)}`,
        type,
        size: allAnswers.size || "",
        color: allAnswers.color || "",
        additionals: Array.isArray(allAnswers.additionals) ? allAnswers.additionals : [],
        strict: !Array.isArray(allAnswers.additionals)
          ? false
          : allAnswers.additionals.length > 0 && !allAnswers.additionals.includes("None"),
        w_image: 0.6,
        w_text: 0.4,
        color_weight: 0.35,
        color_mode: "match",
      };
      if (recoImage?.file) body.image_b64 = await toBase64(recoImage.file);

      const res = await fetch(`${API_BASE}/recommend`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let items = [];
      if (Array.isArray(data.items) && data.items.length) items = data.items;
      else if (Array.isArray(data.related) && data.related.length) items = data.related;

      const sameType = items.filter(it => itemLooksLikeType(it, type));
      const picks = (sameType.length ? sameType : items).slice(0, RECO_K);

      if (picks.length) {
        addRecoMsg({
          role: "bot",
          text: RECO_K === 1
            ? "Here’s the best match from our catalog:"
            : "Here are some great matches from our catalog:",
        });

        picks.forEach(p => {
          addRecoMsg({ role: "bot", product: p });
        });

        // ask about additional custom furniture / changes
        addRecoMsg({
          role:"bot",
          text:"Do you want additional custom furniture or changes based on this recommendation?",
          chips:["Yes, go to custom order","No, that's all for now"],
        });
      } else {
        addRecoMsg({
          role: "bot",
          text: `I couldn’t find a perfect ${type.toLowerCase()} for that selection.`,
        });
        addRecoMsg({ role:"bot", text:"Want to adjust anything?", chips:["Change type","Start over"] });
      }
    } catch (e) {
      setRecoError(e.message || "Recommender failed");
      addRecoMsg({ role:"bot", text:"Sorry — I couldn’t fetch a recommendation right now." });
      addRecoMsg({ role:"bot", text: e.message || "HTTP error" });
    } finally {
      setRecoBusy(false);
    }
  }

  // chips flow (multi-select + YES/NO flow)
  function onRecoChipClick(label){
    // YES → just go to customization, no prefill
    if (label === "Yes, go to custom order") {
      window.location.href = "/customization";
      return;
    }

    if (label === "No, that's all for now") {
      addRecoMsg({
        role:"bot",
        text:"Okay! If you’d like to tweak the recommendation, you can change the type or start over.",
        chips:["Change type","Start over"],
      });
      return;
    }

    if (label === "Change type"){ 
      setRecoType(""); setRecoAnswers({}); setRecoQIndex(0);
      addRecoMsg({role:"bot", text:"Okay—what type would you like?"}); 
      recoAskType(); 
      return; 
    }

    if (label === "Start over"){
      setRecoType(""); setRecoAnswers({}); setRecoQIndex(0); setRecoImage(null);
      setRecoMessages([
        { role:"bot", text:"Okay, starting fresh." },
        { role:"bot", text:"Would you like to upload a photo of your room? I can tailor suggestions from it.", chips:["📷 Upload photo","Skip for now"] },
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

    if (TYPES.includes(label)){ 
      setRecoType(label); 
      addRecoMsg({ role:"user", text:label }); 
      setRecoAnswers({}); setRecoQIndex(0); 
      recoAskNext(label,0); 
      return; 
    }

    if (recoType){
      const qs = TYPE_QUESTIONS[recoType] || [];
      const q = qs[recoQIndex];
      if (!q) { recommendBest(recoType, { ...recoAnswers }); return; }

      if (q.multi){
        if (label === "Done"){
          addRecoMsg({ role:"user", text: (recoAnswers.additionals?.length ? recoAnswers.additionals.join(", ") : "None") });
          const next = recoQIndex + 1;
          if (next < qs.length){ setRecoQIndex(next); recoAskNext(recoType,next); }
          else { recommendBest(recoType, { ...recoAnswers }); }
          return;
        }
        // toggle selection
        setRecoAnswers(a=>{
          const cur = Array.isArray(a.additionals) ? a.additionals.slice() : [];
          const i = cur.indexOf(label);
          if (i>=0) cur.splice(i,1); else cur.push(label);
          return { ...a, additionals: cur };
        });
        return;
      } else {
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

  // FAQ quick answers
  const CONTACT = { phone:"09650934957", email:"furnitunecp@gmail.com", live:"Offline now" };
  const FAQS = [
    { q:"What is Furnitune?", a:"Furnitune is an e-commerce platform for Santos Upholstery offering ready-made products, customization, repairs, an AI recommender, and an FAQ chatbot.", tags:["general"] },
    { q:"How does the recommender system work?", a:"It analyzes your room photo and preferences, encodes them, then finds the closest matches in our catalog.", tags:["recommender","ai"] },
    { q:"What can I customize?", a:"Request custom furniture (dimensions, materials, colors) and add reference images.", tags:["customization"] },
    { q:"Do you accept furniture repair requests?", a:"Yes—even for items not purchased from us. Submit photos and details for assessment.", tags:["repairs"] },
  ];
  function faqBoot(){
    const hi = meName ? `Hi ${meName}!` : "Hi Guest!";
    setFaqMessages([
      { role:"bot", text:`${hi} I’m your Furnitune assistant. How can I help you today?` },
      { role:"bot", text:"Pick a quick question below, or type your own:", chips:FAQS.map(x=>x.q) }
    ]);
  }
  useEffect(()=>{ if(faqOpen && faqMessages.length===0) faqBoot(); },[faqOpen, meName, faqMessages.length]);

  function answerFor(s0){
    const s=s0.trim().toLowerCase();
    if(/call|phone|number|contact/.test(s)) return `You can call us at ${CONTACT.phone}.`;
    if(/email|mail/.test(s)) return `You can email us at ${CONTACT.email}.`;
    if(/chat|live/.test(s)) return `Live Chat is ${CONTACT.live}.`;
    const d=FAQS.find(f=>f.q.toLowerCase()===s); if(d) return d.a;
    const c=FAQS.find(f=> (f.q+" "+(f.tags||[]).join(" ")).toLowerCase().includes(s));
    return c?c.a:`I’m not sure about that yet. Please email ${CONTACT.email} or call ${CONTACT.phone}.`;
  }

  async function askBiz(question){
    setFaqBusy(true);
    setFaqError("");
    try{
      const payload = { question, sessionId: "guest", user: { id: "guest", name: meName, email: "" } };
      const res = await fetch(`${BIZCHAT_BASE}/ask`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = (data.answer || "").trim();
      const stripped = raw.replace(/[.\s]/g,"");
      const safeAnswer = stripped.length < 3
        ? `I’m not sure about that yet. Please email ${CONTACT.email} or call ${CONTACT.phone}.`
        : raw;
      setFaqMessages(p => [...p, { role:"bot", text: safeAnswer }]);
    } catch(e){
      setFaqMessages(p => [...p, { role:"bot", text: answerFor(question) }]);
      setFaqError(e.message || "BizChat failed");
    } finally{
      setFaqBusy(false);
    }
  }

  function onFaqChip(q){
    if (q === "Open Recommender"){
      if (window.FurnituneReco?.open) { window.FurnituneReco.open(); setFaqOpen(false); }
      else { window.location.href = RECO_URL; }
      return;
    }
    setFaqMessages(p=>[...p,{role:"user",text:q}]);
    askBiz(q);
  }

  function onSendFaq(){
    const msg=faqInput.trim(); if(!msg) return;
    setFaqInput("");
    setFaqMessages(p=>[...p,{role:"user",text:msg}]);
    askBiz(msg);
  }

  return (
    <>
      <style>{PANEL_CSS}</style>

      {/* Floating FAB */}
      <div ref={wrapRef} className="fab-wrap" style={{ transform:`translateY(${offset*0.2}px)` }}>
        <button type="button" className="fab-robot" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="fab-menu" aria-label="Assistant">
          <img src={botImg} alt="" />
        </button>
        {open && (
          <div id="fab-menu" className="fab-menu" role="menu">
            <button type="button" className="fab-item" role="menuitem" title="FAQ Chatbot" onClick={()=>{setFaqOpen(true);setOpen(false);}}>💬</button>
            <button type="button" className="fab-item" role="menuitem" title="Recommender" onClick={()=>{ if (window.FurnituneReco?.open) window.FurnituneReco.open(); setOpen(false); }}>✨</button>
          </div>
        )}
      </div>

      {/* FAQ Panel */}
      <div className={`mini-panel ${faqOpen ? "open" : ""}`} aria-hidden={!faqOpen}>
        <div className="topbar">
          <div className="brand"><div className="big">FURNITUNE</div><div className="small">FAQ Chatbot</div></div>
          <button className="close" onClick={()=>setFaqOpen(false)}>Close</button>
        </div>
        <div className="scroll" ref={faqScrollRef}>
          {faqMessages.map((m,i)=> m.role==="user"
            ? <UserBubble key={i}>{m.text}</UserBubble>
            : <BotBubble key={i}>
                <div>{m.text}</div>
                {m.chips?.length ? <div className="chips">{m.chips.map(c=><button key={c} className="chip" onClick={()=>onFaqChip(c)}>{c}</button>)}</div> : null}
              </BotBubble>
          )}
          {faqBusy && <BotBubble><span className="muted">Thinking…</span></BotBubble>}
          {faqError && <BotBubble><span style={{color:"crimson"}}>{faqError}</span></BotBubble>}
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

                {/* Product card(s) */}
                {m.product && (
                  <div className="card">
                    {(() => { const p=m.product; const img=getPrimaryImage(p); return img ? <img src={img} alt={p.title||p.name||"Product"} /> : null; })()}
                    <div className="body">
                      {!!(m.product.type||m.product.baseType) && <div className="type">{m.product.type||m.product.baseType}</div>}
                      <div className="title">{m.product.title||m.product.name||m.product.slug||"Product"}</div>
                      {(m.product.price!=null || m.product.basePrice!=null) && <div className="price">₱{Number(m.product.price ?? m.product.basePrice ?? 0).toFixed(2)}</div>}
                      <a className="btn" href={`/product/${m.product.id}`}>View</a>
                    </div>
                  </div>
                )}

                {/* chips */}
                {m.chips?.length ? (
                  <div className="chips">
                    {m.chips.map(c=>{
                      const isMulti = m.multi && (m.qKey==="additionals");
                      const selected = isMulti && Array.isArray(recoAnswers.additionals) && recoAnswers.additionals.includes(c);
                      return <button key={c} className={`chip ${selected?"on":""}`} onClick={()=>onRecoChipClick(c)}>{c}</button>;
                    })}
                  </div>
                ) : null}
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

const BotBubble = ({ children }) => <div className="msg bot"><div className="bubble bot">{children}</div></div>;
const UserBubble = ({ children }) => <div className="msg user"><div className="bubble user">{children}</div></div>;
