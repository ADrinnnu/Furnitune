import React, { useEffect, useMemo, useState } from "react";
import "../Customization.css";
import "../AllFurnitures.css";
import { useNavigate, useLocation } from "react-router-dom";

import {
  firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  storage,
  ref,
  getDownloadURL,
  auth,
} from "../firebase";

import { query, where } from "firebase/firestore";

/* ───────────────────────── CONFIGURATION ───────────────────────── */

const CATEGORY_OPTIONS = {
  "Beds": {
    hasFoam: true,
    hasCover: true,
    inclusions: "Main bed frame, structural wooden slats/base, and standard assembly hardware.",
    exclusions: "Mattress, foam toppers, pillows, and bed sheets are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL BED FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Metal Frame", "Rubberwood", "Acacia Wood"] },
      { id: "headboardStyle", label: "HEADBOARD STYLE", choices: ["Wing Back", "Panel", "Sleigh", "Book Case", "Plain Upholstered", "Slatted Wood", "Deep Button Tufted", "Vertical Channel", "Quilted"] },
      { id: "legStyle", label: "LEG STYLE", choices: ["Tapered Wood Legs", "Metal Legs", "Hidden Glides", "Block Legs", "Bun Feet Legs"] },
      { id: "frameHeight", label: "FRAME HEIGHT", choices: ["Low Profile (Minimalist)", "Standard Height", "High Clearance (Storage)", "Custom Height"] }
    ]
  },
  "Sofas": {
    hasFoam: true,
    hasCover: true,
    inclusions: "Main sofa frame, primary seat cushions, and backrest cushions.",
    exclusions: "Throw pillows, decorative blankets, and center tables are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL SOFA FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Rubberwood", "Acacia Wood"] },
      { id: "armrestStyle", label: "ARMREST STYLE", choices: ["Track Arms", "English Roll Arms", "Rolled Arms", "Flared Arms", "Pillow Top Arms"] },
      { id: "backCushion", label: "BACKREST STYLE", choices: ["Tight Back", "Loose Cushions", "Semi-Attached", "Tufted Back", "Quilted"] },
      { id: "seatDepth", label: "SEAT DEPTH", choices: ["Standard (21-22\")", "Deep Lounge (23-25\")", "Extra Deep (26\"+)", "Custom Depth"] },
      { id: "legStyle", label: "LEG STYLE", choices: ["Tapered Wood Legs", "Metal Legs", "Hidden Glides", "Block Legs", "Bun Feet Legs"] }
    ]
  },
  "Sectionals": {
    hasFoam: true,
    hasCover: true,
    inclusions: "Complete sectional frame (all modular pieces), seat cushions, and back cushions.",
    exclusions: "Throw pillows, ottomans (unless added as an upgrade), and rugs are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL SECTIONAL FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Rubberwood", "Acacia Wood"] },
      { id: "configuration", label: "CHAISE / SHAPE CONFIGURATION", choices: ["Left-Facing Chaise", "Right-Facing Chaise", "U-Shape", "Symmetrical L-Shape", "Custom Shape"] },
      { id: "armrestStyle", label: "ARMREST STYLE", choices: ["Track Arms", "English Roll Arms", "Rolled Arms", "Flared Arms", "Pillow Top Arms"] },
      { id: "backCushion", label: "BACKREST STYLE", choices: ["Tight Back", "Loose Cushions", "Semi-Attached", "Tufted Back", "Quilted"] },
      { id: "seatDepth", label: "SEAT DEPTH", choices: ["Standard", "Deep Lounge", "Extra Deep", "Custom Depth"] },
      { id: "legStyle", label: "LEG STYLE", choices: ["Tapered Wood Legs", "Metal Legs", "Hidden Glides", "Block Legs", "Bun Feet Legs"] }
    ]
  },
  "Chairs": {
    hasFoam: true,
    hasCover: true,
    inclusions: "The main chair unit and built-in seat padding/cushioning.",
    exclusions: "Extra decorative back pillows and footrests are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL CHAIR FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Metal Frame", "Rubberwood", "Acacia Wood"] },
      { id: "backrestStyle", label: "BACKREST STYLE", choices: ["High Back", "Mid Back", "Curved / Barrel", "Spindle Back", "Custom Height", "Quilted"] },
      { id: "armType", label: "ARMREST TYPE", choices: ["No Arms", "Sloped Wood Arms", "Upholstered Track Arms"] }
    ]
  },
  "Ottomans": {
    hasFoam: true,
    hasCover: true,
    inclusions: "The fully upholstered ottoman unit and base.",
    exclusions: "Decorative wooden trays and surrounding living room decor are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL OTTOMAN FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Rubberwood", "Acacia Wood"] },
      { id: "topStyle", label: "TOP SURFACE STYLE", choices: ["Pillow Top", "Plain Top", "Tufted Top", "Channel Tufted Top", "Quilted Top"] },
      { id: "baseStyle", label: "LEG STYLE", choices: ["Tapered Wood Legs", "Metal Legs", "Hidden Glides", "Block Legs", "Bun Feet Legs"] }
    ]
  },
  "Dining Tables": {
    hasFoam: false,
    hasCover: false, 
    inclusions: "The main dining table top and the structural base/legs.",
    exclusions: "Dining chairs, table runners, and tableware/decorations are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL TABLE FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Rubberwood", "Acacia Wood", "Metal Frame"] },
      { id: "shapeType", label: "TOP SHAPE", choices: ["Rectangular", "Perfect Square", "Round", "Oval", "Abstract / Asymmetrical", "Custom Shape"] },
      { id: "edgeStyle", label: "EDGE PROFILE", choices: ["Straight Edge", "Beveled Edge", "Bullnose Edge", "Round Over Edge"] },
      { id: "legProtection", label: "LEG PROTECTION", choices: ["Hidden Glides", "Rubber Pads", "Plastic Caps", "Anti Skid Pads"] }
    ]
  },
  "Tables": {
    hasFoam: false,
    hasCover: false, 
    inclusions: "The table top and the supporting legs/base.",
    exclusions: "Chairs, surrounding decor, and floor rugs are NOT included.",
    features: [
      { id: "woodMaterial", label: "ARCHITECTURAL TABLE FRAME", choices: ["Mahogany Wood", "Pine Wood", "Gmelina Wood", "Rubberwood", "Acacia Wood", "Metal Frame"] },
      { id: "shapeType", label: "TOP SHAPE", choices: ["Rectangular", "Perfect Square", "Round", "Oval", "Abstract / Asymmetrical", "Custom Shape"] },
      { id: "edgeStyle", label: "EDGE PROFILE", choices: ["Straight Edge", "Beveled Edge", "Bullnose Edge", "Round Over Edge"] },
      { id: "legProtection", label: "LEG PROTECTION", choices: ["Hidden Glides", "Rubber Pads", "Plastic Caps", "Anti Skid Pads"] }
    ]
  },
  "Others": {
    hasFoam: true,
    hasCover: true,
    inclusions: "The primary custom furniture item as ordered.",
    exclusions: "Any items not explicitly listed in the final custom specifications.",
    features: [
      { id: "woodMaterial", label: "PRIMARY MATERIAL", choices: ["Standard Wood", "Standard Metal", "Plastic / Acrylic", "Glass", "Mixed Materials"] },
      { id: "styleVibe", label: "STYLE / VIBE", choices: ["Modern Contemporary", "Industrial", "Classic Traditional", "Minimalist", "Rustic"] }
    ]
  }
};

const FOAM_CHOICES = ["Standard High Density", "Soft / Cloud Plush", "Extra Firm (Orthopedic)", "Memory Foam Topper"];
const COVER_CHOICES = ["Fabric", "Leather", "Linen", "Microfiber", "Velvet", "Cotton"];
const DEFAULT_COLORS = ["#ffffff", "#000000", "#D3C6B3", "#5E5E5E", "#1E3F66", "#2D4739", "#8B4513", "#800020", "#008080", "#E1AD01", "#C08081", "#C0C0C0"];

const COMMON_ADDITIONALS = {
  "Beds": ["Cabinets", "Pull out Bed"],
  "Chairs": ["Cushions", "Hidden Glides"],
  "Sofas": ["Cushions", "Footrest"],
  "Dining Tables": ["Glass on top", "Padded foam on top"],
  "Tables": ["Glass on top", "Padded foam on top"],
  "Sectionals": ["Throw Pillow", "Footrest"],
  "Ottomans": ["Decorative Tray", "With storage"],
  "Others": [],
};

const DEFAULT_SIZES_BY_TYPE = {
  Chairs: ["Standard", "Counter", "Bar", "Custom"],
  Sofas: ["2 Seater", "3 Seater", "4 Seater", "Custom"],
  Sectionals: ["3 Seater", "5 Seater", "6 Seater", "7 Seater", "Custom"],
  Tables: ["2 people", "4 people", "6 people", "8 people", "Custom"],
  "Dining Tables": ["2 people", "4 people", "6 people", "8 people", "Custom"],
  Beds: ["Single", "Double", "Queen", "King", "Custom"],
  Ottomans: ["Standard", "Cube", "Footstool", "Cocktail", "Custom"],
  Others: ["Standard", "Custom"],
};

/* ───────────────────────── HELPERS ───────────────────────── */
const norm = (s) => String(s || "").trim().toLowerCase();
const titleCase = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (s) => norm(s).replace(/\s+/g, "-");
const lc = (s) => String(s ?? "").toLowerCase().trim();
const lcKeys = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [lc(k), v]));

const normalizePricingTables = (p) => p ? { ...p, sizeAdds: lcKeys(p.sizeAdds), sizeMultipliers: lcKeys(p.sizeMultipliers), materialMultipliers: lcKeys(p.materialMultipliers) } : null;

const SIZE_ALIASES = { beds: { king: ["california king", "cal-king"] } };
function canonicalSize(category, size) {
  const L = lc(size);
  const map = SIZE_ALIASES[slugify(category)] || {};
  for (const [canon, alts] of Object.entries(map)) {
    if (L === canon || (alts || []).some((a) => lc(a) === L)) return canon;
  }
  return size;
}

const findAdditionCI = (arr, label) => {
  const n = lc(label);
  return (arr || []).find((a) => lc(a.label || a.key) === n);
};

const normalizeCategory = (raw) => {
  const s = norm(raw);
  if (!s) return "Others";
  if (s.includes("bed")) return "Beds";
  if (s.includes("dining") && s.includes("table")) return "Dining Tables";
  if (s.includes("chair")) return "Chairs";
  if (s.includes("sofa")) return "Sofas";
  if (s.includes("sectional")) return "Sectionals";
  if (s.includes("ottoman")) return "Ottomans";
  if (s.includes("table")) return "Tables";
  return titleCase(raw);
};

const toCents = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
};
const fromCents = (c) => Math.round((c || 0) / 100);
const formatPHP = (php) => Number(php || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

function computePriceCents({ basePriceCents, size, material, additionsSelected, pricing, additionsTable = [], additionsArePesos = false }) {
  const sKey = lc(size);
  const mKey = lc(material);
  const sizeAdd = pricing?.sizeAdds?.[sKey] ?? 0;
  const sizeMult = pricing?.sizeMultipliers?.[sKey] ?? 1;
  const materialMult = pricing?.materialMultipliers?.[mKey] ?? 1;

  const additionsCents = (additionsSelected || []).reduce((acc, label) => {
    const row = findAdditionCI(additionsTable, label);
    const v = Number(row?.cents || 0);
    return acc + (additionsArePesos ? Math.round(v * 100) : v);
  }, 0);

  const pre = basePriceCents + sizeAdd;
  const multiplied = Math.round(pre * sizeMult * materialMult);
  const total = multiplied + additionsCents;

  return { base: basePriceCents, sizeAdd, sizeMult, materialMult, additions: additionsCents, total };
}

/* Storage URL helpers */
function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (/^gs:\/\//i.test(u)) {
    const w = u.replace(/^gs:\/\//i, "");
    const i = w.indexOf("/");
    return i > -1 ? w.slice(i + 1) : null;
  }
  if (u.includes("firebasestorage.googleapis.com")) {
    const m = u.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (!/^https?:\/\//i.test(u)) return u;
  return null;
}
async function toDownloadUrl(val) {
  if (!val) return "";
  try {
    const objPath = objectPathFromAnyStorageUrl(val);
    if (objPath) return await getDownloadURL(ref(storage, objPath));
    return val;
  } catch { return ""; }
}
async function resolveImage(val) { return await toDownloadUrl(val); }
const hydrateProductImages = async (list) =>
  Promise.all(
    list.map(async (p) => {
      const rawImgs = Array.isArray(p.images) ? p.images : Array.isArray(p.imageUrls) ? p.imageUrls : p.image ? [p.image] : [];
      const imgs = (await Promise.all(rawImgs.map(resolveImage))).filter(Boolean);
      const first = imgs[0] || "";
      return { ...p, images: imgs, imageUrls: imgs, image: first };
    })
  );
const pickCardImage = (item) => (Array.isArray(item?.images) && item.images[0]) || (Array.isArray(item?.imageUrls) && item.imageUrls[0]) || item?.image || "";

/* Read Pricing */
async function loadPricingFromSizeRules(category) {
  let snap = await getDocs(query(collection(firestore, "sizePriceRules"), where("type", "==", category)));
  if (snap.empty) {
    snap = await getDocs(query(collection(firestore, "sizePriceRules"), where("type", "==", titleCase(category))));
  }
  if (snap.empty) return null;

  const p = { currency: "PHP", sizeAdds: {}, sizeMultipliers: {}, materialMultipliers: { Fabric: 1, Leather: 1 } };
  snap.forEach((d) => {
    const r = d.data();
    if (!r || !r.size) return;
    const sizeKey = lc(canonicalSize(category, r.size));
    const mode = lc(r.mode);
    const value = Number(r.value || 0);
    if (["delta", "add", "plus"].includes(mode)) p.sizeAdds[sizeKey] = Math.round(value * 100);
    else if (["multiplier", "x", "mul"].includes(mode)) p.sizeMultipliers[sizeKey] = value || 1;
  });
  return p;
}

/* UI Components */
const chipStyle = (active) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: active ? "1px solid #1a1a1a" : "1px solid #e0e0e0",
  background: active ? "#1a1a1a" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  cursor: "pointer",
  userSelect: "none",
  fontSize: "12px",
  fontWeight: active ? "600" : "400",
  transition: "all 0.2s ease",
});

function Chip({ active, onClick, children }) {
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick} style={chipStyle(active)}>
      {children}
    </button>
  );
}

function CatalogDrawer({ open, onClose, productsByCategory, activeCategory, setActiveCategory, onPick }) {
  if (!open) return null;
  const backdropStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9998 };
  const panelStyle = { position: "fixed", top: 0, right: 0, width: "560px", maxWidth: "92vw", height: "100vh", background: "#fff", overflow: "auto", zIndex: 9999, boxShadow: "0 0 20px rgba(0,0,0,0.2)", boxSizing: "border-box", paddingRight: 10 };
  const headerStyle = { position: "sticky", top: 0, background: "#fff", zIndex: 1, padding: "12px 16px", borderBottom: "1px solid #eee" };
  const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "12px 16px 20px 16px" };
  const rail = { display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" };
  const pill = (active) => ({ padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", background: active ? "#111" : "#fff", color: active ? "#fff" : "#111", cursor: "pointer", fontSize: 12 });

  return (
    <>
      <div role="presentation" onClick={onClose} style={backdropStyle} />
      <aside role="dialog" aria-label="Catalog" style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong>Catalog</strong>
            <button className="btn btn-text" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div style={rail}>
            {Object.keys(productsByCategory).map((cat) => {
              const count = productsByCategory[cat]?.length ?? 0;
              return (
                <button key={cat} style={pill(activeCategory === cat)} onClick={() => setActiveCategory(cat)}>
                  {cat} {count ? `(${count})` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div style={gridStyle}>
          {(productsByCategory[activeCategory] || []).map((p) => {
            const img = pickCardImage(p);
            const title = p.title || p.name || "Untitled";
            const price = p.price ?? p.basePrice ?? null;

            return (
              <div key={p.id} className="product-card" onClick={() => onPick(p)} title="Pick this product" style={{ cursor: "pointer" }}>
                {img && <img src={img} alt={title} className="product-image" onError={(e) => (e.currentTarget.style.display = "none")} />}
                <div className="product-info">
                  <div className="product-title">{title}</div>
                  {price != null && <div className="product-price">{formatPHP(price)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

/* ───────── PAGE COMPONENT ───────── */
export default function Customization() {
  const navigate = useNavigate();

  // catalog state
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [activeCategory, setActiveCategory] = useState("Beds");

  // selection state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("Others");
  
  // 1. Size & Dimensions
  const [sizeOptions, setSizeOptions] = useState(["S", "M", "L", "Custom"]);
  const [size, setSize] = useState("S");
  const [customSizeDetails, setCustomSizeDetails] = useState("");

  // 2. Dynamic Features
  const [featureSelections, setFeatureSelections] = useState({});
  const [customFeatureInputs, setCustomFeatureInputs] = useState({}); 
  const [foamDensity, setFoamDensity] = useState("");

  // 3. Upholstery & Color 
  const [coverMaterialType, setCoverMaterialType] = useState("");
  const [coverColor, setCoverColor] = useState(""); 
  const [coverEnabled, setCoverEnabled] = useState(true);

  // pricing state
  const [pricing, setPricing] = useState(null);
  const [additionalsPricing, setAdditionalsPricing] = useState(null);
  const currency = additionalsPricing?.currency || pricing?.currency || "PHP";

  // additionals UI
  const [additionalChoices, setAdditionalChoices] = useState([]);
  const [additionalPicked, setAdditionalPicked] = useState({});
  const [notes, setNotes] = useState("");

  // Refs & Errors
  const [referenceImages, setReferenceImages] = useState([]); 
  const [placeOrderError, setPlaceOrderError] = useState("");

  const catConfig = CATEGORY_OPTIONS[selectedCategory] || CATEGORY_OPTIONS["Others"];
  const productTitle = selectedProduct?.title || selectedProduct?.name || selectedProduct?.id || "";

  // Reset granular choices when category changes
  useEffect(() => {
    setFeatureSelections({});
    setCustomFeatureInputs({});
    setFoamDensity("");
    setCoverMaterialType("");
    setCoverColor("");
  }, [selectedCategory]); 

  // esc + scroll lock when drawer open
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setCatalogOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = catalogOpen ? "hidden" : prev || "";
    return () => { document.body.style.overflow = prev; };
  }, [catalogOpen]);
  
  const loc = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(loc.search);
    const title = query.get("ai_title");
    const color = query.get("ai_color");
    const desc = query.get("ai_desc");
    
    const imgUrl = sessionStorage.getItem("ai_generated_image");

    if (title && imgUrl) {
      let cat = "Others";
      const tLower = title.toLowerCase();
      if (tLower.includes("sofa") || tLower.includes("loveseat") || tLower.includes("settee")) cat = "Sofas";
      else if (tLower.includes("bed")) cat = "Beds";
      else if (tLower.includes("chair")) cat = "Chairs";
      else if (tLower.includes("table")) cat = "Tables";
      else if (tLower.includes("sectional")) cat = "Sectionals";
      else if (tLower.includes("ottoman")) cat = "Ottomans";

      const aiProduct = {
        id: "ai-custom-concept",
        title: title,
        name: title,
        category: cat,
        image: imgUrl, 
        basePrice: 0 
      };

      setSelectedProduct(aiProduct);
      setSelectedCategory(cat);
      
      const correctSizes = DEFAULT_SIZES_BY_TYPE[cat] || DEFAULT_SIZES_BY_TYPE["Others"];
      setSizeOptions([...correctSizes]);
      
      setSize("Custom");
      setCustomSizeDetails("Based on AI Concept generation");
      
      const aiBlueprint = `--- AI CUSTOM CONCEPT ---\nConcept Name: ${title}\nTarget Color / Upholstery: ${color}\nDesign Details: ${desc}`;
      setNotes(aiBlueprint);
      
      sessionStorage.removeItem("ai_generated_image");
    }
  }, [loc.search]);


  // Construct dynamic description for admins and preview
  const descriptionText = useMemo(() => {
    if (!selectedProduct) return "Please select a product to begin customization.";
    const attachments = Object.keys(additionalPicked).filter((k) => additionalPicked[k]);

    let finalDesc = `--- Custom Build Specifications ---\n`;

    let primaryWoodStr = "Pending Selection";

    if (catConfig.features) {
      catConfig.features.forEach((feat) => {
        let val = featureSelections[feat.id];
        
        if (val?.toLowerCase().includes("custom") && customFeatureInputs[feat.id]) {
            val = `${val} - ${customFeatureInputs[feat.id]}`;
        }

        if (feat.id === "woodMaterial") {
            primaryWoodStr = val || "Pending Selection";
        }

        if (val) {
          finalDesc += `• ${titleCase(feat.label)}: ${val}\n`;
        } else {
          finalDesc += `• ${titleCase(feat.label)}: (Pending)\n`;
        }
      });
    }

    if (size === "Custom" && customSizeDetails) {
      finalDesc += `• Custom Size/Shape: ${customSizeDetails}\n`;
    }

    finalDesc += `\n--- Construction & Materials ---\n`;
    finalDesc += `• Constructed using: ${primaryWoodStr}\n`;
    
    if (catConfig.hasFoam) {
      finalDesc += `• Foam / Padding: ${foamDensity || "Pending Selection"}\n`;
    }
    
    if (catConfig.hasCover) {
      finalDesc += `• Upholstery Used: ${coverMaterialType || "Pending Selection"} (Color: ${coverColor || "Pending"})\n`;
    }

    finalDesc += `\n--- Package Inclusions & Exclusions ---\n`;
    finalDesc += `✔️ INCLUDES: ${catConfig.inclusions || "Standard furniture pieces."}\n`;
    finalDesc += `❌ DOES NOT INCLUDE: ${catConfig.exclusions || "Decorations or accessories."}\n`;

    if (attachments.length > 0) {
      finalDesc += `\n➕ ADD-ON UPGRADES: ${attachments.join(", ")}\n`;
    }

    return finalDesc.trim() || "No customizations selected.";
  }, [selectedProduct, additionalPicked, featureSelections, customFeatureInputs, foamDensity, coverMaterialType, coverColor, size, customSizeDetails, catConfig]);

  // load products
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(collection(firestore, "products"));
        if (!alive) return;
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const list = await hydrateProductImages(raw);

        const grouped = list.reduce((acc, p) => {
          const hay = [p.category, p.baseType, p.type, p.kind, p.categorySlug, p.name, p.title].filter(Boolean).map(s => String(s).toLowerCase()).join(" ");
          let cat = "Others";
          if (hay.includes("sectional")) cat = "Sectionals";
          else if (hay.includes("sofa") || hay.includes("couch") || hay.includes("loveseat")) cat = "Sofas";
          else if (hay.includes("bed")) cat = "Beds";
          else if (hay.includes("chair")) cat = "Chairs";
          else if (hay.includes("ottoman") || hay.includes("pouf")) cat = "Ottomans";
          else if (hay.includes("dining") && hay.includes("table")) cat = "Dining Tables";
          else if (hay.includes("table")) cat = "Tables";
          
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(p);
          return acc;
        }, {});

        const order = ["Beds", "Dining Tables", "Chairs", "Sofas", "Sectionals", "Ottomans", "Tables", "Others"];
        const ordered = {};
        order.forEach((k) => { if (grouped[k]?.length) ordered[k] = grouped[k]; });
        Object.keys(grouped).forEach((k) => { if (!(k in ordered)) ordered[k] = grouped[k]; });

        setProductsByCategory(ordered);
        if (!ordered[activeCategory]) {
          const first = Object.keys(ordered)[0];
          if (first) setActiveCategory(first);
        }
      } catch (e) { console.error("Load products failed:", e); }
    })();
    return () => { alive = false; };
  }, []); 

  // load pricing tables
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCategory) return;
      try {
        let p = null;
        let snap = await getDoc(doc(firestore, "pricing", selectedCategory));
        if (!snap.exists()) snap = await getDoc(doc(firestore, "pricing", slugify(selectedCategory)));
        if (snap.exists()) p = snap.data();
        if (!p) p = await loadPricingFromSizeRules(selectedCategory);
        if (!p) {
          const def = await getDoc(doc(firestore, "pricing", "_defaults"));
          p = def.exists() ? def.data() : null;
        }
        if (!cancelled) setPricing(normalizePricingTables(p));
      } catch (e) { console.error("Load pricing failed:", e); if (!cancelled) setPricing(null); }
    })();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  // load additionals pricing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCategory) return;
      try {
        let snap = await getDoc(doc(firestore, "additionals_pricing", selectedCategory));
        if (!snap.exists()) snap = await getDoc(doc(firestore, "additionals_pricing", slugify(selectedCategory)));
        const data = snap.exists() ? snap.data() : null;
        if (!cancelled) setAdditionalsPricing(data);
      } catch (e) { console.error("Load additionals_pricing failed:", e); if (!cancelled) setAdditionalsPricing(null); }
    })();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  // merge choices 
  useEffect(() => {
    const baseAdds = COMMON_ADDITIONALS[selectedCategory] || [];
    const pricedItems = (additionalsPricing?.items || []).map((a) => a.label || a.key);
    const legacyPriced = (pricing?.additions || []).map((a) => a.label || a.key);

    const seen = new Set();
    const merged = [];
    pricedItems.forEach((l) => { const k = String(l); if (!seen.has(lc(k))) { seen.add(lc(k)); merged.push(k); } });
    baseAdds.forEach((l) => { const k = String(l); if (!seen.has(lc(k))) { seen.add(lc(k)); merged.push(k); } });
    legacyPriced.forEach((l) => { const k = String(l); if (!seen.has(lc(k))) { seen.add(lc(k)); merged.push(k); } });

    setAdditionalChoices(merged);
    setAdditionalPicked((prev) => {
      const next = {};
      merged.forEach((k) => (next[k] = !!prev[k]));
      return next;
    });
  }, [selectedCategory, additionalsPricing, pricing]);

  const pickedAdditionals = useMemo(
    () => Object.entries(additionalPicked).filter(([, v]) => v).map(([k]) => k),
    [additionalPicked]
  );

  const additionsTable = additionalsPricing?.items || pricing?.additions || [];
  const additionsArePesos = !!additionalsPricing?.items; 

  const priceBreakdown = useMemo(() => {
    if (!selectedProduct) return null;
    if (selectedProduct.id === "ai-custom-concept") return null;

    const base = selectedProduct.basePriceCents != null ? selectedProduct.basePriceCents : toCents(selectedProduct.price ?? selectedProduct.basePrice ?? 0);
    const sizeForPricing = canonicalSize(selectedCategory, size);

    return computePriceCents({
      basePriceCents: base,
      size: sizeForPricing,
      material: coverMaterialType,
      additionsSelected: pickedAdditionals,
      pricing,
      additionsTable,
      additionsArePesos, 
    });
  }, [selectedProduct, size, coverMaterialType, pickedAdditionals, pricing, additionalsPricing, selectedCategory]);

  function handlePickProduct(p) {
    const hay = [p.category, p.baseType, p.type, p.kind, p.categorySlug, p.name, p.title].filter(Boolean).map(s => String(s).toLowerCase()).join(" ");
    let cat = "Others";
    if (hay.includes("sectional")) cat = "Sectionals";
    else if (hay.includes("sofa") || hay.includes("couch") || hay.includes("loveseat")) cat = "Sofas";
    else if (hay.includes("bed")) cat = "Beds";
    else if (hay.includes("chair")) cat = "Chairs";
    else if (hay.includes("ottoman") || hay.includes("pouf")) cat = "Ottomans";
    else if (hay.includes("dining") && hay.includes("table")) cat = "Dining Tables";
    else if (hay.includes("table")) cat = "Tables";

    setSelectedProduct(p);
    setSelectedCategory(cat);

    const sizes = Array.isArray(p?.sizeOptions) && p.sizeOptions.length ? p.sizeOptions : DEFAULT_SIZES_BY_TYPE[cat] || DEFAULT_SIZES_BY_TYPE.Others;
    
    if (!sizes.includes("Custom")) sizes.push("Custom");
    setSizeOptions(sizes);
    setSize(sizes[0] || "Standard");

    const isCoverEnabled = (CATEGORY_OPTIONS[cat] || CATEGORY_OPTIONS["Others"]).hasCover && (p?.hasCover !== false);
    setCoverEnabled(isCoverEnabled);

    setCatalogOpen(false);
  }

  async function onPickReferenceFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remain = Math.max(0, 3 - referenceImages.length);
    const take = files.slice(0, remain);

    const reads = await Promise.all(
      take.map(
        (f) =>
          new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res({ name: f.name, dataUrl: String(r.result || "") });
            r.onerror = rej;
            r.readAsDataURL(f);
          })
      )
    );

    setReferenceImages((prev) => [...prev, ...reads].slice(0, 3));
    e.target.value = "";
  }
  
  function removeRefImage(i) {
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  const colorBoxStyle = (cHex, activeValue) => ({
    background: cHex,
    outline: activeValue === cHex ? "2px solid #111" : "1px solid #ccc",
  });

  // 🚨 STRICT VALIDATION FUNCTION 🚨
  const handlePlaceOrder = async () => {
    setPlaceOrderError("");
    const missing = [];

    // Check Product & Size
    if (!selectedProduct) missing.push("Product");
    if (!size) missing.push("Size & Dimensions");
    if (size === "Custom" && (!customSizeDetails || !customSizeDetails.trim())) {
      missing.push("Custom Dimensions Details");
    }

    // Check all dynamic Architectural Features (Wood, Frame, Arms, etc.)
    if (catConfig.features) {
      catConfig.features.forEach(feat => {
        if (!featureSelections[feat.id]) {
          missing.push(feat.label);
        } else if (featureSelections[feat.id].toLowerCase().includes("custom")) {
          if (!customFeatureInputs[feat.id] || !customFeatureInputs[feat.id].trim()) {
             missing.push(`${feat.label} (Custom Details)`);
          }
        }
      });
    }

    // Check Foam (If applicable)
    if (catConfig.hasFoam && !foamDensity) {
      missing.push("Uratex Foam Density");
    }

    // Check Cover & Color (If applicable)
    if (catConfig.hasCover && coverEnabled) {
      if (!coverMaterialType) missing.push("Leather / Fabric Type");
      if (!coverColor) missing.push("Cover Color");
    }

    // Block Checkout if anything is missing
    if (missing.length > 0) {
      setPlaceOrderError(
        `Please complete your selections for: ${missing.join(", ")}.`
      );
      return;
    }

    // If passed, compile everything perfectly for the Admin Dashboard
    const compiledMaterials = {};
    if (catConfig.features) {
      catConfig.features.forEach(feat => {
        let val = featureSelections[feat.id];
        if (val?.toLowerCase().includes("custom") && customFeatureInputs[feat.id]) {
            val = `${val} (${customFeatureInputs[feat.id]})`;
        }
        compiledMaterials[feat.label] = val; 
      });
    }

    try {
      const draft = {
        type: "customization",
        productId: selectedProduct?.id || null,
        productTitle: selectedProduct?.title || selectedProduct?.name || null,
        category: selectedCategory,
        size: size || null,
        customSizeDetails: size === "Custom" ? customSizeDetails : null,
        
        materials: {
          ...compiledMaterials,
          "Uratex Foam Density": catConfig.hasFoam ? foamDensity : null,
          "Leather / Fabric Type": (catConfig.hasCover && coverEnabled) ? coverMaterialType : null,
          "Cover Color": (catConfig.hasCover && coverEnabled) ? coverColor : null,
        },
        
        additionals: pickedAdditionals,
        notes: notes || "",
        referenceImagesData: referenceImages,
        descriptionFromProduct: descriptionText,
        unitPrice: priceBreakdown ? fromCents(priceBreakdown.total) : null, 
        priceBreakdown: priceBreakdown
          ? {
              basePHP: fromCents(priceBreakdown.base),
              sizeAddPHP: fromCents(priceBreakdown.sizeAdd),
              sizeMult: priceBreakdown.sizeMult,
              materialMult: priceBreakdown.materialMult,
              additionsPHP: fromCents(priceBreakdown.additions),
              totalPHP: fromCents(priceBreakdown.total),
              currency,
            }
          : null,
        images: Array.isArray(selectedProduct?.images) ? selectedProduct.images : Array.isArray(selectedProduct?.imageUrls) ? selectedProduct.imageUrls : [selectedProduct.image],
      };

      sessionStorage.setItem("custom_draft", JSON.stringify(draft));

      const nextPath = "/Checkout?custom=1";
      const user = auth.currentUser;
      if (!user || user.isAnonymous) {
        sessionStorage.setItem("post_login_redirect", nextPath);
        navigate(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      navigate(nextPath);
    } catch (e) {
      console.error("Prepare custom draft failed:", e);
      alert("Something went wrong. Please try again.");
    }
  };

  /* ───────── UI ───────── */
  return (
    <div className="customization-container">
      <div className="customization-grid">
        {/* LEFT */}
        <div className="left-side">
          <h1 className="title">FURNITURE CUSTOMIZATION</h1>

          <div
            className="preview-box"
            onClick={() => setCatalogOpen(true)}
            title={selectedProduct ? "Click to change product" : "Open Catalog"}
            style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
          >
            {(() => {
              const previewImg = selectedProduct ? pickCardImage(selectedProduct) : "";
              if (previewImg) {
                return (
                  <img
                    src={previewImg}
                    alt={productTitle || "Selected product"}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                );
              }
              return (
                <div
                  data-fallback
                  style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}
                >
                  Click here to choose a product
                </div>
              );
            })()}

            {selectedProduct && (
              <div className="preview-title" title={productTitle} aria-label="Selected product">
                {productTitle}
              </div>
            )}
          </div>

          <CatalogDrawer
            open={catalogOpen}
            onClose={() => setCatalogOpen(false)}
            productsByCategory={productsByCategory}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            onPick={handlePickProduct}
          />

          <div className="section">
            <h2 className="section-title">CONFIGURED SPECIFICATIONS</h2>
            <p className="text" style={{ whiteSpace: "pre-wrap", background: "#f9f9f9", padding: "12px", borderRadius: "8px", border: "1px solid #eee" }}>
              {descriptionText}
            </p>
          </div>

          <div className="section">
            <h2 className="section-title">HOW TO BUILD YOUR PIECE</h2>
            <ul className="steps">
              <li>1. <strong>Product:</strong> Select a base model from our catalog.</li>
              <li>2. <strong>Dimensions:</strong> Choose standard sizing or specify custom shape requirements.</li>
              <li>3. <strong>Architecture:</strong> Fine-tune the structural features.</li>
              {catConfig.hasCover && <li>4. <strong>Aesthetics:</strong> Choose upholstery material and color.</li>}
              <li>5. <strong>Accessories:</strong> Add functional elements and visual references.</li>
            </ul>
          </div>
        </div>

        {/* RIGHT */}
        <div className="right-side" style={{ position: "relative", zIndex: 1 }}>
          
          {/* 1 SIZE */}
          <div className="option">
            <h3 className="option-title">1. SIZE & DIMENSIONS</h3>
            <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sizeOptions.map((s) => (
                <Chip key={s} active={size === s} onClick={() => setSize(s)}>
                  {s}
                </Chip>
              ))}
            </div>
            
            {size === "Custom" && (
              <div style={{ marginTop: 12 }}>
                <label className="sub-label">Custom Dimensions & Shape Specs:</label>
                <textarea
                  placeholder="E.g. Length 200cm, Width 100cm. Describe any abstract shapes, curved edges, specific heights..."
                  value={customSizeDetails}
                  onChange={(e) => setCustomSizeDetails(e.target.value)}
                />
              </div>
            )}
          </div>
          <hr />

           {/* 2 DYNAMIC ARCHITECTURE / STRUCTURE OPTIONS */}
           {catConfig.features && catConfig.features.length > 0 && (
            <div className="option">
                <h3 className="option-title">2. STRUCTURAL ARCHITECTURE</h3>
                
                {catConfig.features.map((feat) => {
                  const isCustomSelected = featureSelections[feat.id]?.toLowerCase().includes("custom");
                  
                  return (
                  <div key={feat.id} style={{marginBottom: 20}}>
                      <label className="sub-label">{feat.label}</label>
                      <div className="buttons-row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {feat.choices.map((choice) => (
                          <Chip 
                            key={choice} 
                            active={featureSelections[feat.id] === choice} 
                            onClick={() => {
                              if (featureSelections[feat.id] === choice) {
                                setFeatureSelections(prev => ({...prev, [feat.id]: ""}));
                              } else {
                                setFeatureSelections(prev => ({...prev, [feat.id]: choice}));
                              }
                            }}
                          >
                            {choice}
                          </Chip>
                      ))}
                      </div>

                      {isCustomSelected && (
                        <div style={{ marginTop: 8 }}>
                            <textarea 
                              style={{ height: 40, width: "100%", fontSize: 12, padding: 8 }}
                              placeholder={`Specify your custom ${feat.label.toLowerCase()} details...`}
                              value={customFeatureInputs[feat.id] || ""}
                              onChange={e => setCustomFeatureInputs(prev => ({...prev, [feat.id]: e.target.value}))}
                            />
                        </div>
                      )}
                  </div>
                )})}
            </div>
          )}
          {catConfig.features && <hr />}

          {/* 3 COMFORT (Conditional) */}
          {catConfig.hasFoam && (
            <div className="option">
                <h3 className="option-title">3. URATEX FOAM DENSITY</h3>
                <div className="buttons-row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FOAM_CHOICES.map((f) => (
                    <Chip key={f} active={foamDensity === f} onClick={() => setFoamDensity(prev => prev === f ? "" : f)}>
                    {f}
                    </Chip>
                ))}
                </div>
            </div>
          )}
          {catConfig.hasFoam && <hr />}

          {/* 4 COVER MATERIAL & COLOR (🚨 ALWAYS SHOWS UNLESS IT'S A TABLE) */}
          {catConfig.hasCover && (
            <div className="option">
                <h3 className="option-title">4. UPHOLSTERY & COLOR</h3>
                
                <label className="sub-label">LEATHER / FABRIC TYPE</label>
                <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {COVER_CHOICES.map((m) => (
                    <Chip key={m} active={coverMaterialType === m} onClick={() => setCoverMaterialType(prev => prev === m ? "" : m)}>
                    {m}
                    </Chip>
                ))}
                </div>

                <label className="sub-label">COLORS</label>
                <div className="colors" style={{flexWrap: "wrap"}}>
                {DEFAULT_COLORS.map((cHex) => (
                    <div
                    key={cHex}
                    className="color-box"
                    style={{
                      ...colorBoxStyle(cHex, coverColor),
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      cursor: "pointer"
                    }}
                    onClick={() => setCoverColor(prev => prev === cHex ? "" : cHex)}
                    title={cHex}
                    />
                ))}
                </div>
            </div>
          )}
          {catConfig.hasCover && <hr />}

          {/* 5 ADDITIONALS */}
          <div className="option">
            <h3 className="option-title">{catConfig.hasCover ? "5." : "3."} ADD-ONS & REFERENCES</h3>

            {additionalChoices.length > 0 && (
              <>
                <label className="sub-label">Functional Upgrades (Optional)</label>
                <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {additionalChoices.map((label) => {
                    const row = findAdditionCI(additionsTable, label);
                    const priceTxt = typeof row?.cents === "number" ? ` (+${formatPHP(row.cents)})` : "";
                    return (
                        <Chip key={label} active={!!additionalPicked[label]} onClick={() => setAdditionalPicked((p) => ({ ...p, [label]: !p[label] }))}>
                        {label}{priceTxt}
                        </Chip>
                    );
                    })}
                </div>
              </>
            )}

            <label className="sub-label">Special Blueprints / Notes (Optional)</label>
            <textarea
              placeholder="e.g., 'Match the wood stain to my provided photo', 'Increase the armrest width by 2 inches'..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ marginBottom: 12, height: 80 }}
            />

            <div style={{ display: "grid", gap: 8 }}>
              <label className="sub-label">Upload Inspiration Images (Optional, Max 3)</label>
              <input type="file" accept="image/*" multiple onChange={onPickReferenceFiles} />
              {referenceImages.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {referenceImages.map((r, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img
                        src={r.dataUrl}
                        alt={`ref-${i}`}
                        style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e5e5" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeRefImage(i)}
                        title="Remove"
                        style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PRICE SUMMARY */}
          <hr />
          <div className="option">
            <h3 className="option-title">ESTIMATED PRICE</h3>
            {/* 🚨 AI PRICE HANDLING 🚨 */}
            {selectedProduct?.id === "ai-custom-concept" ? (
              <div className="text" style={{ padding: "16px", background: "#eef8e9", borderRadius: "8px", border: "1px solid #2F6F62", color: "#1E2C2B" }}>
                <strong>🛠️ Fully Custom AI Build</strong><br/>
                Since this is a 100% unique design generated by AI, our master upholsterers will review your blueprints and provide a custom price quote after you submit this request!
              </div>
            ) : priceBreakdown ? (
              <div className="text">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Base Model</span>
                  <span>{formatPHP(fromCents(priceBreakdown.base))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Size Adj.</span>
                  <span>
                    {formatPHP(fromCents(priceBreakdown.sizeAdd))}
                    {priceBreakdown.sizeMult !== 1 ? ` ×${priceBreakdown.sizeMult}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Material Grade</span>
                  <span>{priceBreakdown.materialMult}×</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Accessories</span>
                  <span>{formatPHP(fromCents(priceBreakdown.additions))}</span>
                </div>
                <div style={{ borderTop: "1px solid #e5e5e5", marginTop: 8, paddingTop: 8, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                  <span>Total Estimate</span>
                  <span>{formatPHP(fromCents(priceBreakdown.total))} {currency}</span>
                </div>
                <p style={{ fontSize: 11, fontStyle: "italic", marginTop: 6, color: '#777' }}>
                   *Note: Final pricing for custom shapes and specific material upgrades will be confirmed upon order review.
                </p>
              </div>
            ) : (
              <div className="text">Select a product to view the price estimate.</div>
            )}
          </div>

          <hr />
          <button className="place-order" onClick={handlePlaceOrder} type="button">
            PROCEED TO CHECKOUT
          </button>

          {placeOrderError && (
            <p style={{ color: "#d9534f", marginTop: 8, fontSize: 13, fontWeight: "bold" }}>
              {placeOrderError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}