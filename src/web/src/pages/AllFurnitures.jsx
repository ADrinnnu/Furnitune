// src/pages/AllFurnitures.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { firestore, storage } from "../firebase";
import * as FS from "firebase/firestore";
import { Link, useLocation } from "react-router-dom";
import { getDownloadURL, ref } from "firebase/storage";
import "../AllFurnitures.css";

const slug = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "-");

const TYPE_LABELS_ALL = ["Beds", "Sofas", "Chairs", "Tables", "Sectionals", "Ottomans"];
const TYPES_BY_ROOM = {
  "living-room": ["Sofas", "Chairs", "Tables", "Sectionals", "Ottomans"],
  bedroom: ["Beds", "Chairs", "Tables", "Ottomans"],
  "dining-room": ["Chairs", "Tables"],
  outdoor: ["Chairs", "Tables", "Ottomans"],
};

const MATERIAL_LABELS = ["Fabrics", "Leather"];
const FRAME_LABELS = ["Metal", "Wood"];

const PRICE_ITEMS = [
  { code: "<5k", label: "Under ₱5,000" },
  { code: "5-9.9k", label: "₱5,000–₱9,999" },
  { code: "10-14.9k", label: "₱10,000–₱14,999" },
  { code: "15k+", label: "₱15,000+" },
];

const makeEmptyFilters = () => ({
  type: new Set(),
  materials: new Set(),
  price: new Set(),
  frame: new Set(),
});

function _tagsToSet(tags) {
  const set = new Set();
  if (!Array.isArray(tags)) return set;
  for (const t of tags) {
    if (typeof t === "string") {
      const s = t.toLowerCase().trim();
      if (s) set.add(s);
    } else if (t && typeof t === "object") {
      const s = String(t.label ?? t.name ?? t.value ?? t.slug ?? t.title ?? "")
        .toLowerCase()
        .trim();
      if (s) set.add(s);
    }
  }
  return set;
}

function normalizeType(d) {
  const raw = String(d.baseType ?? d.type ?? d.category ?? d.categorySlug ?? "").toLowerCase();
  if (raw.includes("sectional")) return "Sectionals";
  if (raw.includes("sofa") || raw.includes("couch")) return "Sofas";
  if (raw.includes("bed")) return "Beds";
  if (raw.includes("chair")) return "Chairs";
  if (raw.includes("table")) return "Tables";
  if (raw.includes("ottoman")) return "Ottomans";
  const n = (d.name || "").toLowerCase();
  if (n.includes("sectional")) return "Sectionals";
  if (n.includes("sofa")) return "Sofas";
  if (n.includes("bed")) return "Beds";
  if (n.includes("chair")) return "Chairs";
  if (n.includes("table")) return "Tables";
  if (n.includes("ottoman")) return "Ottomans";
  return "Other";
}

function normalizeMaterials(d) {
  const tagSet = _tagsToSet(d.tags);
  const out = [];
  if (tagSet.has("fabric") || tagSet.has("fabrics")) out.push("Fabrics");
  if (tagSet.has("leather")) out.push("Leather");
  return out;
}

function normalizeFrameMaterial(d) {
  const tagSet = _tagsToSet(d.tags);
  const out = [];
  if (
    tagSet.has("metal") ||
    tagSet.has("steel") ||
    tagSet.has("iron") ||
    tagSet.has("aluminum") ||
    tagSet.has("aluminium")
  ) {
    out.push("Metal");
  }
  if (
    tagSet.has("wood") ||
    tagSet.has("oak") ||
    tagSet.has("walnut") ||
    tagSet.has("ash") ||
    tagSet.has("teak") ||
    tagSet.has("mahogany") ||
    tagSet.has("acacia") ||
    tagSet.has("mango")
  ) {
    out.push("Wood");
  }
  return out;
}

function normalizeDepartments(d) {
  const candidates = [
    d.departments,
    d.departmentSlugs,
    d.department_slug,
    d.departmentSlug,
    d.department,
    d.rooms,
    d.room,
    d.parentSlug,
  ];
  for (const val of candidates) {
    if (Array.isArray(val) && val.length) return val.map(slug);
    const s = slug(val);
    if (s) return [s];
  }
  const cat = String(d.categorySlug || "").toLowerCase();
  if (cat) {
    const first = cat.split("-")[0];
    const map = { dining: "dining-room", living: "living-room", bedroom: "bedroom", bed: "bedroom", outdoor: "outdoor" };
    const guess = map[first];
    if (guess) return [guess];
  }
  return [];
}

function normalizeCollections(d) {
  const out = new Set();
  const add = (v) => { const s = slug(v); if (s) out.add(s); };
  const addArr = (arr) => Array.isArray(arr) && arr.forEach(add);
  add(d.categorySlug);
  add(d.category);
  addArr(d.collections);
  addArr(d.collectionSlugs);
  addArr(d.tags);
  if (d.isBestSeller) add("best-sellers");
  if (d.isNew || d.isNewArrival) add("new-designs");
  return Array.from(out);
}

function priceBucket(n) {
  const p = Number(n || 0);
  if (p < 5000) return "<5k";
  if (p < 10000) return "5-9.9k";
  if (p < 15000) return "10-14.9k";
  return "15k+";
}

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

async function resolveImage(val) {
  return await toDownloadUrl(val);
}

export default function AllFurnitures({
  room = null,
  collection: coll = null,
  pageTitle = "ALL FURNITURES"
}) {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(makeEmptyFilters);
  const [loading, setLoading] = useState(true);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const category = params.get("category");
    if (category) {
      setFilters((prev) => ({
        ...prev,
        type: new Set([category])
      }));
    }
  }, [location.search]);

  const allowedTypeLabels = useMemo(() => {
    const r = slug(room);
    if (r && TYPES_BY_ROOM[r]) return TYPES_BY_ROOM[r];
    return TYPE_LABELS_ALL;
  }, [room]);

  const clearFilters = useCallback(() => setFilters(makeEmptyFilters()), []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const snap = await FS.getDocs(FS.collection(firestore, "products"));
        let list = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            const imgsRaw = Array.isArray(data.images) ? data.images : [];
            const imgs = (await Promise.all(imgsRaw.map(resolveImage))).filter(Boolean);
            const base = Number(data.basePrice || 0);
            return {
              id: d.id,
              title: data.name || "Untitled",
              price: base,
              _priceBucket: priceBucket(base),
              images: imgs,
              reviewsCount: Number(data.reviewsCount || 0),
              ratingAvg: Number(data.ratingAvg || 0),
              _type: normalizeType(data),
              _materials: normalizeMaterials(data),
              _frame: normalizeFrameMaterial(data),
              _departments: normalizeDepartments(data),
              _collections: normalizeCollections(data),
            };
          })
        );
        if (room) {
          const key = slug(room);
          list = list.filter((p) => p._departments.includes(key));
        }
        if (coll) {
          const c = slug(coll);
          list = list.filter((p) => (p._collections || []).includes(c));
        }
        setProducts(list);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [room, coll]);

  const toggleFilter = (group, value) => {
    setFilters((prev) => {
      const next = new Set(prev[group]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [group]: next };
    });
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filters.type.size) {
        if (!filters.type.has(p._type)) return false;
      }
      if (filters.materials.size) {
        const has = p._materials?.some((m) => filters.materials.has(m));
        if (!has) return false;
      }
      if (filters.frame.size) {
        const has = p._frame?.some((m) => filters.frame.has(m));
        if (!has) return false;
      }
      if (filters.price.size) {
        if (!filters.price.has(p._priceBucket)) return false;
      }
      return true;
    });
  }, [products, filters]);

  return (
    <div className="all-furnitures">
      <div className="filter">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2>{pageTitle}</h2>
          <button
            onClick={clearFilters}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            Clear Filters
          </button>
        </div>

        <div className="filter-group">
          <h3>Type</h3>
          {allowedTypeLabels.map((lbl) => (
            <label key={lbl}>
              <input
                type="checkbox"
                checked={filters.type.has(lbl)}
                onChange={() => toggleFilter("type", lbl)}
              />{" "}
              {lbl}
            </label>
          ))}
        </div>

        <div className="filter-group">
          <h3>Cover Material</h3>
          {MATERIAL_LABELS.map((lbl) => (
            <label key={lbl}>
              <input
                type="checkbox"
                checked={filters.materials.has(lbl)}
                onChange={() => toggleFilter("materials", lbl)}
              />{" "}
              {lbl}
            </label>
          ))}
        </div>

        <div className="filter-group">
          <h3>Price</h3>
          {PRICE_ITEMS.map(({ code, label }) => (
            <label key={code}>
              <input
                type="checkbox"
                checked={filters.price.has(code)}
                onChange={() => toggleFilter("price", code)}
              />{" "}
              {label}
            </label>
          ))}
        </div>

        <div className="filter-group">
          <h3>Frame Material</h3>
          {FRAME_LABELS.map((lbl) => (
            <label key={lbl}>
              <input
                type="checkbox"
                checked={filters.frame.has(lbl)}
                onChange={() => toggleFilter("frame", lbl)}
              />{" "}
              {lbl}
            </label>
          ))}
        </div>
      </div>

      <div className="product-grid">
        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="product-card skeleton" role="status" aria-busy="true">
              <div className="product-image" style={{ height: 160, background: "#eee", borderRadius: 6 }} />
              <h3 className="product-title line" style={{ height: 18, marginTop: 12 }} />
              <p className="product-price line" style={{ width: 80, height: 16 }} />
            </div>
          ))
        ) : filtered.length > 0 ? (
          filtered.map((product) => (
            <div key={product.id} className="product-card">
              <Link to={`/product/${product.id}`}>
                <img
                  src={product.images[0] || "/path/to/default/image.jpg"}
                  alt={product.title}
                  className="product-image"
                />
                <h3 className="product-title">{product.title || "Untitled"}</h3>
                <p className="product-price">₱{product.price ? product.price.toLocaleString() : "N/A"}</p>
              </Link>
              <div className="rating">
                <span>{"⭐".repeat(Math.floor(product.ratingAvg))}</span>
                <p>({product.reviewsCount} Reviews)</p>
              </div>
            </div>
          ))
        ) : (
          <p>No products found.</p>
        )}
      </div>
    </div>
  );
}
