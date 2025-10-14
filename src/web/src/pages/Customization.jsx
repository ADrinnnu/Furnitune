// src/pages/Customization.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../Customization.css";
import "../AllFurnitures.css";
import { useNavigate } from "react-router-dom";

// Your app's firebase wrapper must export these:
import {
  firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  storage,
  ref,
  getDownloadURL,
} from "../firebase";

// If your wrapper doesn't re-export query/where, import from Firestore directly:
import { query, where } from "firebase/firestore";

/* ───────────────────────── helpers ───────────────────────── */
const norm = (s) => String(s || "").trim().toLowerCase();
const titleCase = (s) =>
  String(s || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (s) => norm(s).replace(/\s+/g, "-");

// case-insensitive helpers
const lc = (s) => String(s ?? "").toLowerCase().trim();
const lcKeys = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [lc(k), v]));
const normalizePricingTables = (p) =>
  p
    ? {
        ...p,
        sizeAdds: lcKeys(p.sizeAdds),
        sizeMultipliers: lcKeys(p.sizeMultipliers),
        materialMultipliers: lcKeys(p.materialMultipliers),
      }
    : null;

// OPTIONAL: alias unusual size labels to the ones in your UI
const SIZE_ALIASES = {
  beds: {
    king: ["california king", "cal-king"],
  },
};
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
  if (s.includes("bench")) return "Benches";
  if (s.includes("table")) return "Tables";
  return titleCase(raw);
};

const DEFAULT_SIZES_BY_TYPE = {
  Chairs: ["Standard", "Counter", "Bar"],
  Sofas: ["2 Seater", "3 Seater", "4 Seater"],
  Sectionals: ["3 Seater", "5 Seater", "6 Seater", "7 Seater"],
  Tables: ["2 people", "4 people", "6 people", "8 people"],
  "Dining Tables": ["2 people", "4 people", "6 people", "8 people"],
  Beds: ["Single", "Double", "Queen", "King"],
  Ottomans: ["Standard", "Cube", "Footstool", "Cocktail"],
  Benches: ["2 Seater", "3 Seater", "4 Seater"],
  Others: ["Standard"],
};

const COMMON_ADDITIONALS = {
  Beds: ["Cabinets", "Pull out Bed"],
  Chairs: ["Cushions", "With or without armrest"],
  Sofas: ["Cushions", "Footrest"],
  "Dining Tables": ["Glass on top", "Padded foam on top"],
  Tables: ["Glass on top", "Padded foam on top"],
  Benches: ["With storage", "Pillows"],
  Sectionals: ["Throw Pillow", "Footrest"],
  Ottomans: ["Decorative Tray", "With storage"],
  Others: [],
};

// money helpers (store/compute in centavos for accuracy)
const toCents = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
};
const fromCents = (c) => Math.round((c || 0) / 100);
const formatPHP = (php) =>
  Number(php || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });

/**
 * price = ((base + sizeAdd) * sizeMultiplier * materialMultiplier) + sum(additions)
 * All money in CENTS to avoid float errors.
 */
function computePriceCents({
  basePriceCents,
  size,
  material,
  additionsSelected,
  pricing,
  additionsTable = [],
}) {
  const sKey = lc(size);
  const mKey = lc(material);

  const sizeAdd = pricing?.sizeAdds?.[sKey] ?? 0;
  const sizeMult = pricing?.sizeMultipliers?.[sKey] ?? 1;
  const materialMult = pricing?.materialMultipliers?.[mKey] ?? 1;

  const additionsCents = (additionsSelected || []).reduce((acc, label) => {
    const row = findAdditionCI(additionsTable, label); // CI match
    return acc + (row?.cents || 0);
  }, 0);

  const pre = basePriceCents + sizeAdd;
  const multiplied = Math.round(pre * sizeMult * materialMult);
  const total = multiplied + additionsCents;

  return { base: basePriceCents, sizeAdd, sizeMult, materialMult, additions: additionsCents, total };
}

/* ───────── storage URL helpers (gs:// safe) ───────── */
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
  if (!/^https?:\/\//i.test(u)) return u; // looks like object path
  return null;
}
async function toDownloadUrl(val) {
  if (!val) return "";
  try {
    const objPath = objectPathFromAnyStorageUrl(val);
    if (objPath) return await getDownloadURL(ref(storage, objPath));
    return val;
  } catch {
    return "";
  }
}
async function resolveImage(val) {
  return await toDownloadUrl(val);
}
const hydrateProductImages = async (list) =>
  Promise.all(
    list.map(async (p) => {
      const rawImgs = Array.isArray(p.images)
        ? p.images
        : Array.isArray(p.imageUrls)
        ? p.imageUrls
        : p.image
        ? [p.image]
        : [];
      const imgs = (await Promise.all(rawImgs.map(resolveImage))).filter(Boolean);
      const first = imgs[0] || "";
      return { ...p, images: imgs, imageUrls: imgs, image: first };
    })
  );
const pickCardImage = (item) =>
  (Array.isArray(item?.images) && item.images[0]) ||
  (Array.isArray(item?.imageUrls) && item.imageUrls[0]) ||
  item?.image ||
  "";

/* ───────── read size rules → pricing shape ───────── */
async function loadPricingFromSizeRules(category) {
  // try exact Category first (e.g., "Beds")
  let snap = await getDocs(query(collection(firestore, "sizePriceRules"), where("type", "==", category)));
  // if empty, optionally try slug ("beds")
  if (snap.empty) {
    snap = await getDocs(query(collection(firestore, "sizePriceRules"), where("type", "==", titleCase(category))));
  }
  if (snap.empty) return null;

  const p = {
    currency: "PHP",
    sizeAdds: {},
    sizeMultipliers: {},
    materialMultipliers: { Fabric: 1, Leather: 1 }, // neutral unless you also store these
  };

  snap.forEach((d) => {
    const r = d.data(); // { mode, size, type, value }
    if (!r || !r.size) return;

    // allow alias like "California King" → "King"
    const sizeKey = lc(canonicalSize(category, r.size));
    const mode = lc(r.mode);
    const value = Number(r.value || 0);

    if (["delta", "add", "plus"].includes(mode)) {
      p.sizeAdds[sizeKey] = Math.round(value * 100); // PHP → cents
    } else if (["multiplier", "x", "mul"].includes(mode)) {
      p.sizeMultipliers[sizeKey] = value || 1;
    }
  });

  return p;
}

/* ───────── Chip ───────── */
const chipStyle = (active) => ({
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d9d9d9",
  background: active ? "#1a1a1a" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  cursor: "pointer",
  pointerEvents: "auto",
  userSelect: "none",
});
function Chip({ active, onClick, children }) {
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick} style={chipStyle(active)}>
      {children}
    </button>
  );
}

/* ───────── Catalog Drawer ───────── */
function CatalogDrawer({ open, onClose, productsByCategory, activeCategory, setActiveCategory, onPick }) {
  if (!open) return null;

  const backdropStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9998 };
  const panelStyle = {
    position: "fixed",
    top: 0,
    right: 0,
    width: "560px",
    maxWidth: "92vw",
    height: "100vh",
    background: "#fff",
    overflow: "auto",
    zIndex: 9999,
    boxShadow: "0 0 20px rgba(0,0,0,0.2)",
    boxSizing: "border-box",
    paddingRight: 10,
  };
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
              <div
                key={p.id}
                className="product-card"
                onClick={() => { onPick(p); }}
                title="Pick this product"
                style={{ cursor: "pointer" }}
              >
                {img && (
                  <img
                    src={img}
                    alt={title}
                    className="product-image"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
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

/* ───────── page ───────── */
export default function Customization() {
  const navigate = useNavigate();

  // catalog state
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [activeCategory, setActiveCategory] = useState("Beds");

  // selection state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("Others");
  const [sizeOptions, setSizeOptions] = useState(["S", "M", "L", "Custom"]);
  const [size, setSize] = useState("S");
  const [coverColor, setCoverColor] = useState("#D3C6B3");
  const [coverMaterialType, setCoverMaterialType] = useState("Fabric");
  const [coverPalette, setCoverPalette] = useState([]);
  const [coverEnabled, setCoverEnabled] = useState(true);

  // pricing state
  const [pricing, setPricing] = useState(null); // size/material table (pricing or rules)
  const [additionalsPricing, setAdditionalsPricing] = useState(null); // top-level collection
  const currency = pricing?.currency || "PHP";

  // additionals UI
  const [additionalChoices, setAdditionalChoices] = useState([]);
  const [additionalPicked, setAdditionalPicked] = useState({});
  const [notes, setNotes] = useState("");

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

  const productTitle =
  selectedProduct?.title ||
  selectedProduct?.name ||
  selectedProduct?.id ||
  "";

  const descriptionText = useMemo(() => {
    if (selectedProduct?.description) return selectedProduct.description;
    return "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent euismod, odio vitae viverra cursus, lacus justo vulputate nisi, nec ullamcorper nunc eros at massa. Sed eu aliquam mauris.";
  }, [selectedProduct]);

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
          const cat = normalizeCategory(p.category || p.baseType || p.type || p.kind || p.categorySlug);
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(p);
          return acc;
        }, {});

        const order = ["Beds","Dining Tables","Chairs","Sofas","Sectionals","Ottomans","Benches","Tables","Others"];
        const ordered = {};
        order.forEach((k) => { if (grouped[k]?.length) ordered[k] = grouped[k]; });
        Object.keys(grouped).forEach((k) => { if (!(k in ordered)) ordered[k] = grouped[k]; });

        setProductsByCategory(ordered);
        if (!ordered[activeCategory]) {
          const first = Object.keys(ordered)[0];
          if (first) setActiveCategory(first);
        }
      } catch (e) {
        console.error("Load products failed:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // load size/material pricing from /pricing/<Category or slug>; fallback to /sizePriceRules; then _defaults
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCategory) return;
      try {
        let p = null;

        // 1) pricing/<Category> or pricing/<slug>
        let snap = await getDoc(doc(firestore, "pricing", selectedCategory));
        if (!snap.exists()) {
          snap = await getDoc(doc(firestore, "pricing", slugify(selectedCategory)));
        }
        if (snap.exists()) {
          p = snap.data();
        }

        // 2) fallback to sizePriceRules
        if (!p) {
          p = await loadPricingFromSizeRules(selectedCategory);
        }

        // 3) final fallback to pricing/_defaults
        if (!p) {
          const def = await getDoc(doc(firestore, "pricing", "_defaults"));
          p = def.exists() ? def.data() : null;
        }

        if (!cancelled) setPricing(normalizePricingTables(p));
      } catch (e) {
        console.error("Load pricing failed:", e);
        if (!cancelled) setPricing(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  // load additionals pricing from top-level /additionals_pricing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCategory) return;
      try {
        let snap = await getDoc(doc(firestore, "additionals_pricing", selectedCategory));
        if (!snap.exists()) {
          snap = await getDoc(doc(firestore, "additionals_pricing", slugify(selectedCategory)));
        }
        const data = snap.exists() ? snap.data() : null;
        if (!cancelled) setAdditionalsPricing(data);
      } catch (e) {
        console.error("Load additionals_pricing failed:", e);
        if (!cancelled) setAdditionalsPricing(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  // merge additionals choices
  useEffect(() => {
    const baseAdds = COMMON_ADDITIONALS[selectedCategory] || [];
    const pricedRoot = (additionalsPricing?.items || []).map((a) => a.label || a.key);
    const legacyPriced = (pricing?.additions || []).map((a) => a.label || a.key);
    const merged = Array.from(new Set([...baseAdds, ...pricedRoot, ...legacyPriced]));
    setAdditionalChoices(merged);
    setAdditionalPicked((prev) => {
      const next = {};
      merged.forEach((k) => (next[k] = !!prev[k]));
      return next;
    });
  }, [selectedCategory, additionalsPricing, pricing]);

  const handlePickProduct = (p) => {
    const cat = normalizeCategory(p.category || p.baseType || p.type || p.kind || p.categorySlug);
    setSelectedProduct(p);
    setSelectedCategory(cat);

    const sizes =
      Array.isArray(p?.sizeOptions) && p.sizeOptions.length
        ? p.sizeOptions
        : DEFAULT_SIZES_BY_TYPE[cat] || DEFAULT_SIZES_BY_TYPE.Others;
    setSizeOptions(sizes);
    setSize(sizes[0] || "Standard");

    const raw = Array.isArray(p?.colorOptions) ? p.colorOptions : [];
    const palette = raw
      .map((c) => ({ hex: String(c?.hex || c?.color || "").trim(), name: c?.name || "" }))
      .filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.hex));
    const enabled = p?.hasCover === false ? false : palette.length > 0 || p?.hasCover === true;
    setCoverEnabled(enabled);
    setCoverPalette(palette);
    if (enabled) setCoverColor(palette[0]?.hex || "#D3C6B3");

    setCatalogOpen(false);
  };

  const pickedAdditionals = useMemo(
    () => Object.entries(additionalPicked).filter(([, v]) => v).map(([k]) => k),
    [additionalPicked]
  );

  const additionsTable = additionalsPricing?.items || pricing?.additions || [];

  const priceBreakdown = useMemo(() => {
    if (!selectedProduct) return null;

    const base =
      selectedProduct.basePriceCents != null
        ? selectedProduct.basePriceCents
        : toCents(selectedProduct.price ?? selectedProduct.basePrice ?? 0);

    // use canonicalized size so your rules like "California King" can map to "King"
    const sizeForPricing = canonicalSize(selectedCategory, size);

    return computePriceCents({
      basePriceCents: base,
      size: sizeForPricing,
      material: coverMaterialType,
      additionsSelected: pickedAdditionals,
      pricing,
      additionsTable,
    });
  }, [selectedProduct, size, coverMaterialType, pickedAdditionals, pricing, additionalsPricing, selectedCategory]);

  const handlePlaceOrder = async () => {
    try {
      const draft = {
        type: "customization",
        productId: selectedProduct?.id || null,
        productTitle: selectedProduct?.title || selectedProduct?.name || null,
        category: selectedCategory,
        size: size || null,
        cover: { materialType: coverMaterialType, color: coverColor },
        additionals: pickedAdditionals,
        notes: notes || "",
        descriptionFromProduct: selectedProduct?.description || null,
        unitPrice: priceBreakdown ? fromCents(priceBreakdown.total) : null, // PHP
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
        images:
          Array.isArray(selectedProduct?.images)
            ? selectedProduct.images
            : Array.isArray(selectedProduct?.imageUrls)
            ? selectedProduct.imageUrls
            : [],
      };

      sessionStorage.setItem("custom_draft", JSON.stringify(draft));
      navigate("/Checkout?custom=1");
    } catch (e) {
      console.error("Prepare custom draft failed:", e);
      alert("Something went wrong. Please try again.");
    }
  };

  const toggleAdditional = (label) =>
    setAdditionalPicked((prev) => ({ ...prev, [label]: !prev[label] }));

  const colorBoxStyle = (c) => ({
    background: c,
    outline: coverColor === c ? "2px solid #111" : "none",
  });

  /* ───────── UI ───────── */
  return (
    <div className="customization-container">
      <div className="customization-grid">
        {/* LEFT */}
        <div className="left-side">
          <h1 className="title">FURNITURE CUZTOMIZATION</h1>

          <div
            className="preview-box"
            onClick={() => setCatalogOpen(true)}
            title={selectedProduct ? "Click to change product" : "Open Catalog"}
            style={{ cursor: "pointer", position: "relative", overflow: "hidden" }}
          >
            {productTitle && (
    <div className="preview-title" title={productTitle} aria-label="Selected product">
      {productTitle}
    </div>
    )}
            {(() => {
              const previewImg = selectedProduct ? pickCardImage(selectedProduct) : "";
              if (previewImg) {
                return (
                  <img
                    src={previewImg}
                    alt={selectedProduct?.title || selectedProduct?.name || "Selected product"}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      const fb = e.currentTarget.parentElement.querySelector("[data-fallback]");
                      if (fb) fb.style.display = "flex";
                    }}
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
            <h2 className="section-title">DESCRIPTION</h2>
            <p className="text" style={{ whiteSpace: "pre-wrap" }}>{descriptionText}</p>
          </div>

          <div className="section">
            <h2 className="section-title">STEPS</h2>
            <ul className="steps">
              <li>The first step is to choose type of furniture.</li>
              <li>The second step is to select size.</li>
              <li>The third step is to choose the desired color.</li>
              <li>The fourth step is to pick material depending on preference.</li>
              <li>The last step is to provide additional notes if necessary.</li>
            </ul>
          </div>
        </div>

        {/* RIGHT */}
        <div className="right-side" style={{ position: "relative", zIndex: 1, pointerEvents: "auto" }}>
          {/* 1 SIZE */}
          <div className="option">
            <h3 className="option-title">1 CHOOSE SIZE</h3>
            <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", pointerEvents: "auto" }}>
              {sizeOptions.map((s) => (
                <Chip key={s} active={size === s} onClick={() => setSize(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
          <hr />

          {/* 2 COLOR (if enabled) */}
          {coverEnabled && (
            <>
              <div className="option">
                <h3 className="option-title">2 CHOOSE COVER COLOR</h3>
                <div className="colors" style={{ pointerEvents: "auto" }}>
                  {(coverPalette.length ? coverPalette.map((c) => c.hex) : ["#D3C6B3", "#A29B89", "#5E5E5E", "#B76E79"]).map((c) => (
                    <div key={c} className="color-box" style={colorBoxStyle(c)} onClick={() => setCoverColor(c)} title={c} />
                  ))}
                </div>
              </div>
              <hr />
            </>
          )}

          {/* 3 MATERIAL */}
          <div className="option">
            <h3 className="option-title">3 CHOOSE COVER MATERIAL</h3>
            <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", pointerEvents: "auto" }}>
              {["Fabric", "Leather"].map((m) => (
                <Chip key={m} active={coverMaterialType === m} onClick={() => setCoverMaterialType(m)}>
                  {m}
                </Chip>
              ))}
            </div>
          </div>
          <hr />

          {/* 4 ADDITIONALS */}
          <div className="option">
            <h3 className="option-title">4 ADDITIONALS</h3>

            {additionalChoices.length > 0 && (
              <div className="buttons-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, pointerEvents: "auto" }}>
                {additionalChoices.map((label) => (
                  <Chip key={label} active={!!additionalPicked[label]} onClick={() => toggleAdditional(label)}>
                    {label}
                  </Chip>
                ))}
              </div>
            )}

            <textarea
              placeholder="Write here..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ pointerEvents: "auto" }}
            />
          </div>

          {/* PRICE SUMMARY */}
          <hr />
          <div className="option">
            <h3 className="option-title">PRICE SUMMARY</h3>
            {priceBreakdown ? (
              <div className="text" style={{ pointerEvents: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Base</span>
                  <span>{formatPHP(fromCents(priceBreakdown.base))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Size adj.</span>
                  <span>
                    {formatPHP(fromCents(priceBreakdown.sizeAdd))}
                    {priceBreakdown.sizeMult !== 1 ? ` ×${priceBreakdown.sizeMult}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Material multiplier</span>
                  <span>{priceBreakdown.materialMult}×</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Additions</span>
                  <span>{formatPHP(fromCents(priceBreakdown.additions))}</span>
                </div>
                <div style={{ borderTop: "1px solid #e5e5e5", marginTop: 8, paddingTop: 8, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                  <span>Total</span>
                  <span>{formatPHP(fromCents(priceBreakdown.total))} {currency}</span>
                </div>
              </div>
            ) : (
              <div className="text">Select a product to see price.</div>
            )}
          </div>

          <hr />
          <button className="place-order" onClick={handlePlaceOrder} type="button" style={{ pointerEvents: "auto" }}>
            PLACE ORDER
          </button>
        </div>
      </div>
    </div>
  );
}
