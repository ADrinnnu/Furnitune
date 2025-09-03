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
  collection,
  query,
  where,
  getDocs,
} from "../firebase";
import "../ProductDetail.css";

const FABRICS = [
  { id: "marble", label: "Marble", sw: "#d9d3c7" },
  { id: "terra", label: "Terracotta", sw: "#b86a52" },
  { id: "cement", label: "Cement", sw: "#6f6f6f" },
  { id: "harbour", label: "Harbour", sw: "#2c3e50" },
];

// Fallbacks used only if neither product/category provides sizeOptions AND no rules exist
const DEFAULT_SIZES_BY_TYPE = {
  Chairs: ["Standard", "Counter", "Bar"],
  Sofas: ["2 Seater", "3 Seater", "4 Seater"],
  Sectionals: ["3 Seater", "5 Seater", "6 Seater", "7 Seater"],
  Tables: ["2 people", "4 people", "6 people", "8 people"],
  Beds: ["Single", "Double", "Queen", "King"],
  Ottomans: ["Standard", "Cube", "Footstool", "Cocktail"],
  Benches: ["2 Seater", "3 Seater", "4 Seater"],
};

const norm = (s) => String(s || "").trim().toLowerCase();
const slugify = (s) => norm(s).replace(/\s+/g, "-");
const titleCase = (s) =>
  String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function resolveCategorySlug(data) {
  if (data.categorySlug) return String(data.categorySlug).trim().toLowerCase();
  const raw = data.baseType || data.type || data.category || data.name || "";
  return slugify(raw);
}

/* ---------- Storage URL resolver ---------- */
function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (/^gs:\/\//i.test(u)) {
    const withoutScheme = u.replace(/^gs:\/\//i, "");
    const firstSlash = withoutScheme.indexOf("/");
    return firstSlash > -1 ? withoutScheme.slice(firstSlash + 1) : null;
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
  } catch {
    return "";
  }
}
async function resolveStorageUrl(val) {
  return await toDownloadUrl(val);
}

function normalizeTypeLabel(data, catSlug) {
  const t = (data.baseType || data.type || "").toLowerCase();
  const c = String(catSlug || "").toLowerCase();
  if (t.includes("chair") || c.includes("chair")) return "Chairs";
  if (t.includes("sofa") || t.includes("couch") || c.includes("sofa")) return "Sofas";
  if (t.includes("bed") || c.includes("bed")) return "Beds";
  if (t.includes("table") || c.includes("table")) return "Tables";
  if (t.includes("bench") || c.includes("bench")) return "Benches";
  if (t.includes("ottoman") || c.includes("ottoman")) return "Ottomans";
  if (t.includes("sectional") || c.includes("sectional")) return "Sectionals";
  return titleCase(catSlug || t || "Furniture");
}

export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [product, setProduct] = useState(undefined); // undefined=loading, null=notfound
  const [images, setImages] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // UI state (unchanged)
  const [fabric, setFabric] = useState(FABRICS[0].id);
  const [sizeOptions, setSizeOptions] = useState([]); // labels as displayed on chips
  const [size, setSize] = useState("");               // selected display label
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true });

  // ✅ New: pricing keys (logic only; no UI change)
  const [priceByKey, setPriceByKey] = useState({}); // norm(label) -> absolute price
  const [sizeKey, setSizeKey] = useState("");       // norm(selected label)

  useEffect(() => {
    if (!id) { setProduct(null); return; }

    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "products", String(id)));
        if (!snap.exists()) { setProduct(null); return; }
        const data = snap.data();

        // Images
        const rawImgs =
          Array.isArray(data.imageUrls) && data.imageUrls.length
            ? data.imageUrls
            : (Array.isArray(data.images) && data.images.length
                ? data.images
                : (data.image ? [data.image] : []));
        const resolved = (await Promise.all(rawImgs.map(resolveStorageUrl))).filter(Boolean);
        setImages(resolved);
        setActiveIdx(0);

        // Meta
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
        });

        const catSlug = resolveCategorySlug(data);
        const typeLabel = normalizeTypeLabel(data, catSlug);

        // Start with any product/category sizes
        let displaySizes = Array.isArray(data.sizeOptions) ? data.sizeOptions.slice() : null;
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

        // 👉 Read relative rules and compute absolute prices (no UI change)
        const keyed = {};              // norm(label) -> price
        if (typeLabel) {
          try {
            const qRules = query(
              collection(firestore, "sizePriceRules"),
              where("type", "==", typeLabel)
            );
            const snapRules = await getDocs(qRules);

            // Build rule map keyed by normalized label
            const byKey = new Map();
            snapRules.forEach((d) => {
              const r = d.data(); // { size, mode, value }
              const k = norm(r.size);
              const mode = String(r.mode || "delta").toLowerCase();
              const v = Number(r.value || 0);
              let abs = basePrice;
              if (mode === "multiplier" || mode === "x" || mode === "mult") {
                abs = Math.round(basePrice * (isNaN(v) ? 1 : v));
              } else if (mode === "absolute") {
                abs = isNaN(v) ? basePrice : v;
              } else {
                abs = basePrice + (isNaN(v) ? 0 : v); // delta
              }
              byKey.set(k, { label: String(r.size), price: abs });
            });

            if (byKey.size) {
              // Align any provided size labels to rule labels (case-insensitive)
              const aligned = [];
              for (const s of displaySizes) {
                const hit = byKey.get(norm(s));
                aligned.push(hit ? hit.label : s);
              }
              const labelsFromRules = Array.from(byKey.values()).map((x) => x.label);
              displaySizes = aligned.filter(Boolean).length
                ? [...new Set(aligned)]
                : [...new Set(labelsFromRules)];

              for (const [k, rec] of byKey) keyed[k] = rec.price;
            }
          } catch (e) {
            console.warn("sizePriceRules(type) read:", e?.code || e);
          }
        }

        // Finalize sizes and default selection
        displaySizes = Array.isArray(displaySizes) ? displaySizes : [];
        setSizeOptions(displaySizes);

        const first = displaySizes[0] || "";
        setSize(first);
        setSizeKey(norm(first));
        setPriceByKey(keyed);
      } catch (err) {
        console.error("Error fetching product:", err);
        setProduct(null);
      }
    })();
  }, [id]);

  // Compute price with normalized key; fallback to basePrice
  const unitPrice = useMemo(() => {
    if (!product) return 0;
    if (sizeKey && priceByKey[sizeKey] != null) return Number(priceByKey[sizeKey]);
    return Number(product.basePrice || 0);
  }, [product, sizeKey, priceByKey]);

  const priceStr = `₱${Number(unitPrice || 0).toLocaleString()}`;
  const hero = images[activeIdx] || "/placeholder.jpg";

  const handleAddToCart = () => {
    alert(
      `Added: ${product.name}` +
      (size ? ` — ${size}` : "") +
      (fabric ? ` (${fabric})` : "") +
      ` @ ${priceStr}`
    );
  };

  if (product === undefined) return <div className="pd-loading">Loading…</div>;
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
              onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; }}
            />
          </div>

          {images.length > 1 && (
            <div className="pd-thumbstrip">
              {images.map((u, i) => (
                <button
                  key={u + i}
                  className={`thumb ${i === activeIdx ? "active" : ""}`}
                  onClick={() => setActiveIdx(i)}
                  aria-label={`Image ${i + 1}`}
                >
                  <img src={u} alt={`Thumb ${i + 1}`} />
                </button>
              ))}
            </div>
          )}

          <div className="pd-desc slab">
            <h3>DESCRIPTION</h3>
            <p>
              {product.description ||
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."}
            </p>
          </div>
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

            {/* Step 1 */}
            <div className="rp-step">
              <button
                className="rp-step-h"
                onClick={() => setOpen((o) => ({ ...o, 1: !o[1] }))}
                aria-expanded={open[1]}
              >
                <span className="rp-num">1</span>
                <span className="rp-label">CHOOSE FABRIC</span>
                <span className={`chev ${open[1] ? "open" : ""}`}>▾</span>
              </button>

              {open[1] && (
                <div className="rp-step-c">
                  <div className="swatches">
                    {FABRICS.map((f) => (
                      <button
                        key={f.id}
                        className={`swatch ${fabric === f.id ? "active" : ""}`}
                        style={{ background: f.sw }}
                        onClick={() => setFabric(f.id)}
                        aria-label={f.label}
                        title={f.label}
                      />
                    ))}
                  </div>
                  <div className="swatch-labels">
                    {FABRICS.map((f) => <span key={f.id}>{f.label}</span>)}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div className="rp-step">
              <button
                className="rp-step-h"
                onClick={() => setOpen((o) => ({ ...o, 2: !o[2] }))}
                aria-expanded={open[2]}
              >
                <span className="rp-num">2</span>
                <span className="rp-label">CHOOSE SIZE</span>
                <span className={`chev ${open[2] ? "open" : ""}`}>▾</span>
              </button>

              {open[2] && (
                <div className="rp-step-c">
                  {sizeOptions.length ? (
                    <div className="chip-tray">
                      <div className="chips">
                        {sizeOptions.map((s) => (
                          <button
                            key={s}
                            className={`chip ${size === s ? "active" : ""}`}
                            onClick={() => {
                              const lbl = String(s);
                              setSize(lbl);
                              setSizeKey(norm(lbl)); // logic only; no style change
                            }}
                          >
                            {s}
                          </button>
                        ))}
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
              <button
                className="rp-step-h"
                onClick={() => setOpen((o) => ({ ...o, 3: !o[3] }))}
                aria-expanded={open[3]}
              >
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
              <button
                type="button"
                className="price-pill"
                onClick={() => navigate("/checkout")}
              >
                {priceStr}
              </button>
              <button
                type="button"
                className="price-pill add-cart"
                onClick={handleAddToCart}
              >
                <span className="cart-ic" aria-hidden>🛒</span>
                <span>ADD TO CART</span>
              </button>
            </div>
          </aside>

          <div className="pd-help help-box outside">
            <h4>NEED ASSISTANCE?</h4>
            <p>💬 Live Chat: Offline now</p>
            <p>📞 Call: 123-323-312</p>
            <p>✉️ Email Us: Furnitune@jameyl.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
