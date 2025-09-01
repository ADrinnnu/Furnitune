// src/pages/ProductDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  firestore,
  storage,
  doc,
  getDoc,
  ref,
  getDownloadURL,
} from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import "../ProductDetail.css";

const FABRICS = [
  { id: "marble", label: "Marble", sw: "#d9d3c7" },
  { id: "terra", label: "Terracotta", sw: "#b86a52" },
  { id: "cement", label: "Cement", sw: "#6f6f6f" },
  { id: "harbour", label: "Harbour", sw: "#2c3e50" },
];

// fallback sizes so all Chairs share same options
const DEFAULT_SIZES_BY_TYPE = {
  Chairs: ["Standard", "Counter", "Bar"],
};

const slugify = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "-");
const titleCase = (s) =>
  String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function resolveCategorySlug(data) {
  if (data.categorySlug) return String(data.categorySlug).trim().toLowerCase();
  const raw = data.baseType || data.type || data.category || data.name || "";
  return slugify(raw);
}

async function resolveStorageUrl(val) {
  if (!val || typeof val !== "string") return "";
  if (/^https?:\/\//i.test(val)) return val;
  try { return await getDownloadURL(ref(storage, val)); } catch { return ""; }
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
  return titleCase(catSlug || t || "Furniture");
}

export default function ProductDetail() {
  const { id } = useParams();

  const [product, setProduct] = useState(undefined); // undefined=loading, null=notfound
  const [images, setImages] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // UI state
  const [fabric, setFabric] = useState(FABRICS[0].id);
  const [sizeOptions, setSizeOptions] = useState([]);
  const [size, setSize] = useState("");
  const [absPrices, setAbsPrices] = useState({}); // size -> absolute price
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState({ 1: true, 2: true, 3: true });

  useEffect(() => {
    if (!id) { setProduct(null); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "products", String(id)));
        if (!snap.exists()) { setProduct(null); return; }
        const data = snap.data();

        // images
        const rawImgs = Array.isArray(data.images) && data.images.length
          ? data.images : (data.image ? [data.image] : []);
        const resolved = (await Promise.all(rawImgs.map(resolveStorageUrl))).filter(Boolean);
        setImages(resolved);
        setActiveIdx(0);

        // header/meta
        const rawType = data.baseType ?? data.type ?? data.category ?? data.categorySlug ?? "";
        const displayType = rawType ? String(rawType).toUpperCase() : "FURNITURE";
        setProduct({
          id: snap.id,
          name: data.name || "Untitled Product",
          type: displayType,
          description: data.description || "",
          basePrice: Number(data.basePrice ?? 0),
          ratingAvg: Number(data.ratingAvg ?? 0),
          reviewsCount: Number(data.reviewsCount ?? 0),
        });

        // sizes: product → category → default by type
        const catSlug = resolveCategorySlug(data);
        let sizes = Array.isArray(data.sizeOptions) ? data.sizeOptions : null;

        if (!sizes && catSlug) {
          try {
            const catDoc = await getDoc(doc(firestore, "categories", catSlug));
            if (catDoc.exists() && Array.isArray(catDoc.data().sizeOptions)) {
              sizes = catDoc.data().sizeOptions;
            }
          } catch {}
        }

        const typeLabel = normalizeTypeLabel(data, catSlug);
        if (!sizes || !sizes.length) sizes = DEFAULT_SIZES_BY_TYPE[typeLabel] || [];

        sizes = Array.isArray(sizes) ? sizes : [];
        setSizeOptions(sizes);
        if (sizes.length) setSize(String(sizes[0]));

        // prices by type -> filter to sizes we show
        const priceMap = {};
        if (typeLabel) {
          try {
            const qType = query(collection(firestore, "sizePrices"), where("type", "==", typeLabel));
            const snapType = await getDocs(qType);
            snapType.forEach((d) => {
              const r = d.data();
              const k = String(r?.size || "");
              if (!k) return;
              if (!sizes.length || sizes.includes(k)) priceMap[k] = Number(r.price || 0);
            });
          } catch (e) {
            console.warn("sizePrices(type) read:", e?.code || e);
          }
        }
        setAbsPrices(priceMap);
      } catch (err) {
        console.error("Error fetching product:", err);
        setProduct(null);
      }
    })();
  }, [id]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    if (size && absPrices[size] != null) return Number(absPrices[size]);
    return Number(product.basePrice || 0);
  }, [product, size, absPrices]);

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
                  <img src={u} alt={`Thumb ${i+1}`} />
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
                            onClick={() => setSize(String(s))}
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

            {/* CTA row — both buttons share the pill style */}
            <div className="rp-cta-row">
              <button type="button" className="price-pill" onClick={handleAddToCart}>
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
            <p>💬 Live Chat: Offline now</p>
            <p>📞 Call: 123-323-312</p>
            <p>✉️ Email Us: Furnitune@jameyl.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
