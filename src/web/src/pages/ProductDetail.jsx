// src/pages/ProductDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  firestore,
  storage,
  doc,
  getDoc,
  ref,
  getDownloadURL,
  collection, query, where, getDocs,
} from "../firebase";
import { useCart } from "../state/CartContext";
import { setCheckoutItems } from "../utils/checkoutSelection";
import "../ProductDetail.css";
import ReviewsBlock from "../components/ReviewsBlock";

/* ------------------ Defaults / helpers ------------------ */

const DEFAULT_SIZES_BY_TYPE = {
  Chairs:     ["Standard", "Counter", "Bar"],
  Sofas:      ["2 Seater", "3 Seater", "4 Seater"],
  Sectionals: ["3 Seater", "5 Seater", "6 Seater", "7 Seater"],
  Tables:     ["2 people", "4 people", "6 people", "8 people"],
  Beds:       ["Single", "Double", "Queen", "King"],
  Ottomans:   ["Standard", "Cube", "Footstool", "Cocktail"],
};

// Fallback swatches if a product has none
const FALLBACK_SWATCHES = [
  { id: "neutral-1", label: "Neutral 1", sw: "#d1d5db" },
  { id: "neutral-2", label: "Neutral 2", sw: "#9ca3af" },
  { id: "neutral-3", label: "Neutral 3", sw: "#6b7280" },
];

const norm = (s) => String(s || "").trim().toLowerCase();
const slug = (s) => norm(s).replace(/\s+/g, "-");
const titleCase = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function resolveCategorySlug(data) {
  if (data.categorySlug) return String(data.categorySlug).trim().toLowerCase();
  const raw = data.baseType || data.type || data.category || data.name || "";
  return slug(raw);
}
function normalizeTypeLabel(data, catSlug) {
  const t = (data.baseType || data.type || "").toLowerCase();
  const c = String(catSlug || "").toLowerCase();
  if (t.includes("chair")     || c.includes("chair"))     return "Chairs";
  if (t.includes("sofa")      || t.includes("c couch") || c.includes("sofa")) return "Sofas";
  if (t.includes("bed")       || c.includes("bed"))       return "Beds";
  if (t.includes("table")     || c.includes("table"))     return "Tables";
  if (t.includes("ottoman")   || c.includes("ottoman"))   return "Ottomans";
  if (t.includes("sectional") || c.includes("sectional")) return "Sectionals";
  return titleCase(catSlug || t || "Furniture");
}

/** Keep sizes in the exact order you define for each type. */
function sortSizesForType(typeLabel, sizes) {
  const desired = DEFAULT_SIZES_BY_TYPE[typeLabel] || [];
  const byDesired = [];
  const seen = new Set();
  for (const label of desired) {
    if (sizes.some(s => String(s) === label)) {
      byDesired.push(label);
      seen.add(label);
    }
  }
  for (const s of sizes) {
    const str = String(s);
    if (!seen.has(str)) byDesired.push(str);
  }
  return byDesired;
}

/* ---------- Storage URL resolver (robust, silent on missing) ---------- */
function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;

  // gs://bucket/path -> "path"
  if (/^gs:\/\//i.test(u)) {
    const without = u.replace(/^gs:\/\//i, "");
    const i = without.indexOf("/");
    return i > -1 ? without.slice(i + 1) : null;
  }

  // Firebase Storage HTTPS URL -> extract /o/<objectPath>
  if (/^https?:\/\//i.test(u) && u.includes("firebasestorage.googleapis.com")) {
    const m = u.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Plain object path like "folder/file.png"
  if (!/^https?:\/\//i.test(u)) return u;

  // Other https (CDN/remote) – not storage
  return null;
}

async function resolveStorageUrl(val) {
  if (!val) return "";
  try {
    const objPath = objectPathFromAnyStorageUrl(val);
    if (objPath) {
      return await getDownloadURL(ref(storage, objPath));
    }
    // Already a normal HTTPS (non-Firebase) URL
    return val;
  } catch (e) {
    console.warn("[storage] resolve failed:", val, e?.code || e);
    return "";
  }
}

/* ---------- Variant helpers (color × size) ---------- */
async function toHttps(u) {
  if (!u) return "";
  const obj = objectPathFromAnyStorageUrl(u);
  if (!obj) return u; // already https or unsupported
  try { return await getDownloadURL(ref(storage, obj)); } catch { return ""; }
}
function pickVariantPaths(prod, colorId, sizeId) {
  // Tables that do not use color: prefer imagesBySize[sizeId]
  if (!colorId && prod?.imagesBySize?.[sizeId]) {
    const bySize = prod.imagesBySize[sizeId];
    if (Array.isArray(bySize) && bySize.length) return bySize;
  }

  // Color × Size matrix (default path)
  const arr = prod?.imagesByOption?.[colorId]?.[sizeId];
  if (Array.isArray(arr) && arr.length) return arr;
  const colorMap = prod?.imagesByOption?.[colorId];
  if (colorMap) {
    const first = Object.values(colorMap).flat();
    if (first?.length) return first;
  }
  if (Array.isArray(prod?.images) && prod.images.length) return prod.images;
  if (prod?.defaultImagePath) return [prod.defaultImagePath];
  return [];
}
function isComboAvailable(prod, cId, sId) {
  const arr = prod?.imagesByOption?.[cId]?.[sId];
  return Array.isArray(arr) && arr.length > 0;
}

/** Map a display size label to the options.sizes id, with tolerant matching */
function mapSizeLabelToId(rawData, label) {
  const opts = Array.isArray(rawData?.options?.sizes) ? rawData.options.sizes : [];
  if (!opts.length) return { id: null, matched: false };

  const targetNorm = norm(label);
  const targetSlug = slug(label);

  // exact id/label (case-insensitive)
  let hit = opts.find(o => norm(o.id) === targetNorm || norm(o.label || "") === targetNorm);
  if (hit) return { id: String(hit.id), matched: true };

  // by slug
  hit = opts.find(o => slug(o.id) === targetSlug || slug(o.label || "") === targetSlug);
  if (hit) return { id: String(hit.id), matched: true };

  // heuristics
  if (/^\d+\s*people$/.test(targetNorm)) {
    const n = targetNorm.split(" ")[0];
    hit = opts.find(o => o.id === `${n}p`);
    if (hit) return { id: String(hit.id), matched: true };
  }
  if (/^\d+\s*seater$/.test(targetNorm)) {
    const n = targetNorm.split(" ")[0];
    hit = opts.find(o => o.id === `${n}seater`);
    if (hit) return { id: String(hit.id), matched: true };
  }
  return { id: null, matched: false };
}

/* ---------- Size-based measurement picker ---------- */
function pickMeasurementForSize(raw, sizeLabel) {
  const mm = raw?.measurementImages || {};
  if (!sizeLabel || !mm || typeof mm !== "object") return "";
  if (mm[sizeLabel]) return mm[sizeLabel]; // exact
  const key = Object.keys(mm).find(k => norm(k) === norm(sizeLabel)); // case-insensitive
  return key ? mm[key] : (mm.default || "");
}

/* ------------------ Component ------------------ */
export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(undefined); // undefined=loading, null=notfound
  const [rawData, setRawData] = useState(null);
  const [images, setImages] = useState([]);
  const [baseImages, setBaseImages] = useState([]);  // keep base gallery so we can revert
  const [activeIdx, setActiveIdx] = useState(0);

  // NO preselection
  const [fabric, setFabric] = useState(null);   // colorId | null
  const [colors, setColors] = useState([]);     // {id,label,sw}[]
  const [hasCover, setHasCover] = useState(false);

  const [sizeOptions, setSizeOptions] = useState([]); // display labels
  const [size, setSize] = useState("");               // selected label ("" = none)

  const [absPrices, setAbsPrices] = useState({});
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true });

  // measurement image (depends on size)
  const [measurementUrl, setMeasurementUrl] = useState("");

  const isHex = (s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s||""));

  // Load product
  useEffect(() => {
    if (!id) { setProduct(null); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "products", String(id)));
        if (!snap.exists()) { setProduct(null); return; }
        const data = snap.data();
        setRawData(data);

        // Base images (do NOT switch on load)
        const rawImgs = Array.isArray(data.imageUrls) && data.imageUrls.length
          ? data.imageUrls
          : (Array.isArray(data.images) && data.images.length
              ? data.images
              : (data.defaultImagePath ? [data.defaultImagePath] : (data.image ? [data.image] : [])));
        const resolved = (await Promise.all(rawImgs.map(resolveStorageUrl))).filter(Boolean);
        const base = resolved.length ? resolved : ["/placeholder.jpg"];
        setBaseImages(base);
        setImages(base);
        setActiveIdx(0);

        // Header/meta
        const rawType = data.baseType ?? data.type ?? data.category ?? data.categorySlug ?? "";
        const displayType = rawType ? String(rawType).toUpperCase() : "FURNITURE";
        const basePrice = Number(data.basePrice ?? 0);
        setProduct({
          id: snap.id,
          name: data.name || "Untitled Product",
          type: displayType,
          description: data.description || "",
          basePrice,
          ratingAvg: Number(data.ratingAvg ?? 0),
          reviewsCount: Number(data.reviewsCount ?? 0),
          options: data.options || undefined,
        });

        // COLORS → build palette
        const optColors = Array.isArray(data?.options?.colors) ? data.options.colors : null;
        let palette = [];
        if (optColors?.length) {
          palette = optColors.map((c, i) => ({
            id: String(c.id || slug(c.label || c.name || `color-${i}`)),
            label: String(c.label || c.name || `Color ${i+1}`),
            sw: String(c.hex || "#cccccc"),
          }));
        } else {
          const rawColors = Array.isArray(data.colorOptions) ? data.colorOptions : [];
          const mapped = rawColors.map((c, i) => ({
            id: slug(c?.name || `color-${i}`),
            label: c?.name || `Color ${i+1}`,
            sw: c?.hex || "#cccccc",
          }));
          palette = mapped.length ? mapped : FALLBACK_SWATCHES;
        }
        setColors(palette);

        // Decide whether to show color selection
        const catSlug = resolveCategorySlug(data);
        const typeLabel = normalizeTypeLabel(data, catSlug);
        const forceHideColors =
          typeLabel === "Tables" ||
          data.hideColor === true ||
          data.options?.hideColor === true ||
          data.disableColorSelection === true ||
          data.options?.disableColorSelection === true;

        setHasCover(palette.length > 0 && !forceHideColors);
        setFabric(null); // no color selected

        // SIZES
        const optSizes = Array.isArray(data?.options?.sizes) ? data.options.sizes : null;
        let displaySizes = optSizes?.length ? optSizes.map(s => s.label || s.id) : null;

        if (!displaySizes && catSlug) {
          try {
            const catDoc = await getDoc(doc(firestore, "categories", catSlug));
            if (catDoc.exists() && Array.isArray(catDoc.data().sizeOptions)) {
              displaySizes = catDoc.data().sizeOptions.slice();
            }
          } catch { /* ignore */ }
        }
        if (!displaySizes || !displaySizes.length) {
          displaySizes = DEFAULT_SIZES_BY_TYPE[typeLabel] || [];
        }

        // Price rules
        const priceMap = {};
        if (typeLabel) {
          try {
            const qRules = query(collection(firestore, "sizePriceRules"), where("type", "==", typeLabel));
            const snapRules = await getDocs(qRules);
            const rules = [];
            snapRules.forEach((d) => rules.push(d.data()));

            const byKey = new Map();
            for (const r of rules) {
              const key = norm(r.size);
              const mode = String(r.mode || "delta").toLowerCase();
              const v = Number(r.value || 0);
              let abs = basePrice;
              if (mode === "multiplier" || mode === "x" || mode === "mult") abs = Math.round(basePrice * (isNaN(v) ? 1 : v));
              else if (mode === "absolute") abs = isNaN(v) ? basePrice : v;
              else abs = basePrice + (isNaN(v) ? 0 : v);
              byKey.set(key, { label: r.size, price: abs });
            }

            if (byKey.size) {
              const aligned = [];
              for (const s of (displaySizes || [])) {
                const hit = byKey.get(norm(s));
                aligned.push(hit ? hit.label : s);
              }
              displaySizes = aligned.length ? [...new Set(aligned)] : [...new Set(rules.map(r => String(r.size)))];
              // store multiple keys for tolerant lookup
              for (const [, rec] of byKey) {
                priceMap[rec.label] = rec.price;           // exact label
                priceMap[norm(rec.label)] = rec.price;     // normalized (lowercased, trimmed)
                priceMap[slug(rec.label)] = rec.price;     // slug (spaces→hyphen)
              }
            }
          } catch (e) {
            console.warn("sizePriceRules(type) read:", e?.code || e);
          }
        }

        // enforce exact ordering you specified
        displaySizes = sortSizesForType(typeLabel, displaySizes);

        setSizeOptions(Array.isArray(displaySizes) ? displaySizes : []);
        setSize("");                // no size selected
        setAbsPrices(priceMap);

        // initial measurement reset
        setMeasurementUrl("");

      } catch (err) {
        console.error("Error fetching product:", err);
        setProduct(null);
      }
    })();
  }, [id]);

  // Swap logic:
  // - Tables: size alone changes images (via imagesBySize in Firestore)
  // - Other furniture: require BOTH color & size; otherwise revert to base
  useEffect(() => {
    if (!id || !rawData) return;
    const cat = resolveCategorySlug(rawData);
    const typeLabel = normalizeTypeLabel(rawData, cat);
    const isTable = typeLabel === "Tables";
    if ((isTable && !size) || (!isTable && (!fabric || !size))) { setImages(baseImages); setActiveIdx(0); return; }

    (async () => {
      try {
        const { id: sizeId, matched } = mapSizeLabelToId(rawData, size);
        if (!matched || !sizeId) { setImages(baseImages); setActiveIdx(0); return; }

        const paths = pickVariantPaths(rawData, isTable ? null : fabric, sizeId);
        const https = (await Promise.all(paths.map(toHttps))).filter(Boolean);
        if (https.length) {
          setImages(https);
          setActiveIdx(0);
        } else {
          setImages(baseImages);
          setActiveIdx(0);
        }
      } catch {
        setImages(baseImages);
        setActiveIdx(0);
      }
    })();
  }, [id, rawData, fabric, size, baseImages]);

  // Resolve measurement image when size changes (no network if empty)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!rawData || !size) { setMeasurementUrl(""); return; }
      let val =
        pickMeasurementForSize(rawData, size) ||
        rawData.measurementImage ||
        rawData.specImage ||
        rawData.sizeChartImage ||
        rawData.options?.measurementImage ||
        "";
      if (!val) { setMeasurementUrl(""); return; }
      const url = await resolveStorageUrl(val);
      if (!cancelled) setMeasurementUrl(url || "");
    })();
    return () => { cancelled = true; };
  }, [rawData, size]);

  // PRICE: exact → normalized → slug; otherwise base
  const unitPrice = useMemo(() => {
    if (!product) return 0;
    if (size) {
      if (absPrices[size] != null) return Number(absPrices[size]);
      const normKey = Object.keys(absPrices || {}).find(k => norm(k) === norm(size));
      if (normKey) return Number(absPrices[normKey]);
      const slugKey = Object.keys(absPrices || {}).find(k => slug(k) === slug(size));
      if (slugKey) return Number(absPrices[slugKey]);
    }
    return Number(product.basePrice || 0);
  }, [product, size, absPrices]);

  const priceStr = `₱${Number(unitPrice || 0).toLocaleString()}`;
  const hero = images[activeIdx] || "/placeholder.jpg";

  const { addToCart: ctxAddToCart } = { addToCart };
  const buildLineItem = (qty = 1) => ({
    productId: product.id,
    id: product.id,
    title: product.name,
    name: product.name,
    qty: Number(qty || 1),
    price: Number(unitPrice || 0),
    size: size || null,
    notes: notes || "",
    thumb: images?.[0] || "/placeholder.jpg",
    image: images?.[0] || "/placeholder.jpg",
    colorName: (colors.find(c => c.id === fabric)?.label) || null,
    colorHex: (colors.find(c => c.id === fabric)?.sw) || null,
  });

  function handleBuyNow() {
    const item = buildLineItem(1);
    setCheckoutItems([item]);
    navigate("/checkout");
  }
  function handleAddToCart() {
    const item = buildLineItem(1);
    try {
      if (typeof ctxAddToCart === "function") ctxAddToCart(item);
      navigate("/cart");
    } catch (e) {
      console.error("addToCart failed:", e);
      alert("Could not add to cart. Please try again.");
    }
  }

  // ---------- SKELETON ----------
  if (product === undefined) {
    return (
      <div className="pd-wrap">
        <div className="pd-grid">
          <section className="pd-left">
            <div className="pd-stage light skeleton" role="status" aria-busy="true" style={{ minHeight: 300 }}>
              <div style={{ width: "100%", height: 320, background: "#eee", borderRadius: 8 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 64, height: 48, background: "#eee", borderRadius: 6 }} />)}
            </div>
            <div className="pd-desc slab" style={{ marginTop: 18 }}>
              <h3 style={{ height: 22, width: 180, background: "#eee", borderRadius: 6 }} />
              <p style={{ height: 60, width: "100%", background: "#eee", borderRadius: 6, marginTop: 8 }} />
            </div>
          </section>

          <div className="pd-right-col">
            <aside className="pd-card right-pane skeleton" style={{ padding: 18 }}>
              <div style={{ height: 18, width: 140, background: "#eee", borderRadius: 6 }} />
              <div style={{ height: 20, width: "100%", background: "#eee", marginTop: 10, borderRadius: 6 }} />
              <div style={{ height: 12, width: "50%", background: "#eee", marginTop: 10, borderRadius: 6 }} />
              <div style={{ marginTop: 16 }}>
                <div style={{ height: 10, width: "100%", background: "#eee", borderRadius: 6, marginBottom: 8 }} />
                <div style={{ height: 10, width: "70%", background: "#eee", borderRadius: 6, marginBottom: 8 }} />
                <div style={{ height: 10, width: "80%", background: "#eee", borderRadius: 6 }} />
              </div>
              <div className="rp-cta-row" style={{ marginTop: 18, display: "flex", gap: 12 }}>
                <div style={{ height: 44, width: 110, background: "#eee", borderRadius: 8 }} />
                <div style={{ height: 44, width: 140, background: "#eee", borderRadius: 8 }} />
              </div>
            </aside>

            <div className="pd-help help-box outside" style={{ marginTop: 12 }}>
              <h4 style={{ height: 18, width: 120, background: "#eee", borderRadius: 6 }} />
              <p style={{ height: 12, width: "60%", background: "#eee", borderRadius: 6, marginTop: 8 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // -----------------------------

  if (product === null) return <div className="pd-loading">Product not found.</div>;

  return (
    <div className="pd-wrap">
      <div className="pd-grid">
        {/* LEFT */}
        <section className="pd-left">
          <div className="pd-stage light">
            <img
              src={hero}
              alt={product.name}
              className="pd-main contain"
              onError={(e)=>{ e.currentTarget.src="/placeholder.jpg"; }}
            />
          </div>

          {images.length > 1 && (
            <div className="pd-thumbstrip">
              {images.map((u, i) => (
                <button
                  key={u + i}
                  className={`thumb ${i === activeIdx ? "active" : ""}`}
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Image ${i+1}`}
                >
                  <img src={u || "/placeholder.jpg"} alt={`Thumb ${i+1}`} />
                </button>
              ))}
            </div>
          )}

          <div className="pd-desc slab">
            <h3>DESCRIPTION</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {product.description ||
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."}
            </p>
          </div>

          {/* Measurements: only after a size is chosen AND a URL is resolvable */}
          {size && measurementUrl && (
            <div className="pd-desc slab">
              <h3>MEASUREMENTS — {size}</h3>
              <img
                src={measurementUrl}
                alt={`${product.name} measurements (${size})`}
                className="pd-measure"
                onError={(e)=>{ e.currentTarget.style.display='none'; }}
              />
            </div>
          )}

          {/* REVIEWS */}
          <ReviewsBlock firestore={firestore} productId={product.id} />
        </section>

        {/* RIGHT */}
        <div className="pd-right-col">
          <aside className="pd-card right-pane">
            <div className="rp-header">
              <div className="rp-type">{product.type}</div>
              <div className="rp-title">{product.name}</div>
              {product.reviewsCount > 0 && (
                <div className="rp-reviews">
                  <span className="stars">
                    {"★".repeat(Math.round(product.ratingAvg))}
                  </span>
                  <span className="muted">&nbsp;{product.reviewsCount} Reviews</span>
                </div>
              )}
              <div className="rp-price">{priceStr}</div>
            </div>

            {/* Step 1 — CHOOSE COVER COLOR (toggle to unselect) */}
            {hasCover && (
            <div className="rp-step">
              <button className="rp-step-h" onClick={() => setOpen((o) => ({ ...o, 1: !o[1] }))} aria-expanded={open[1]}>
                <span className="rp-num">1</span>
                <span className="rp-label">CHOOSE COVER COLOR</span>
                <span className={`chev ${open[1] ? "open" : ""}`}>▾</span>
              </button>

              {open[1] && (
                <div className="rp-step-c">
                  <div className="swatches">
                    {colors.map((f) => (
                      <button
                        key={f.id}
                        className={`swatch ${fabric === f.id ? "active" : ""}`}
                        style={{ background: isHex(f.sw) ? f.sw : "#ccc" }}
                        onClick={() => setFabric(prev => prev === f.id ? null : f.id)} // toggle
                        aria-label={f.label}
                        title={f.label}
                      />
                    ))}
                  </div>
                  <div className="swatch-labels">
                    {colors.map((f) => <span key={f.id}>{f.label}</span>)}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Step 2 — CHOOSE SIZE (toggle to unselect) */}
            <div className="rp-step">
              <button className="rp-step-h" onClick={() => setOpen((o) => ({ ...o, 2: !o[2] }))} aria-expanded={open[2]}>
                <span className="rp-num">2</span>
                <span className="rp-label">CHOOSE SIZE</span>
                <span className={`chev ${open[2] ? "open" : ""}`}>▾</span>
              </button>

              {open[2] && (
                <div className="rp-step-c">
                  {sizeOptions.length ? (
                    <div className="chip-tray">
                      <div className="chips">
                        {sizeOptions.map((s) => {
                          const { id: sizeId, matched } = mapSizeLabelToId(rawData, s);
                          // Only disable if matched a concrete id AND combo lacks images.
                          const available = fabric
                            ? (rawData && matched ? isComboAvailable(rawData, fabric, sizeId) : true)
                            : true;

                          const isActive = size === s;

                          return (
                            <button
                              key={s}
                              className={`chip ${isActive ? "active" : ""}`}
                              onClick={() => setSize(prev => prev === s ? "" : String(s))} // toggle
                              disabled={!available}
                              title={!available ? "Not available for this color" : s}
                              style={!available ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="muted" style={{ padding: "8px 4px" }}>
                      No size options available for this item.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className="rp-step">
              <button className="rp-step-h" onClick={() => setOpen((o) => ({ ...o, 3: !o[3] }))} aria-expanded={open[3]}>
                <span className="rp-num">3</span>
                <span className="rp-label">DESCRIPTION</span>
                <span className={`chev ${open[3] ? "open" : ""}`}>▾</span>
              </button>

              {open[3] && (
                <div className="rp-step-c">
                  <textarea
                    className="pd-notes rp-notes"
                    rows={6}
                    placeholder="Add notes or special instructions here."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* CTA row */}
            <div className="rp-cta-row">
              <button type="button" className="price-pill" onClick={handleBuyNow}>
                {priceStr}
              </button>
              <button type="button" className="price-pill add-cart" onClick={handleAddToCart}>
                <span className="cart-ic" aria-hidden>🛒</span>
                <span>ADD TO CART</span>
              </button>
            </div>
          </aside>

          <div className="pd-help help-box outside">
            <h4>NEED ASSISTANCE?</h4>
            <p>💬 AI ChatBot: Online now</p>
            <p>📞 Call: 09650934957</p>
            <p>✉️ Email Us: furnitunecp@gmail.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
