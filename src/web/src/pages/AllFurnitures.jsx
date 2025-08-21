// src/pages/AllFurnitures.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../AllFurnitures.css";

// If you already have a data layer, use that:
import { listProducts } from "../data/products"; // returns all products (mock or firestore)

const TYPES = ["Beds", "Sofas", "Chairs", "Tables", "Benches", "Sectionals", "Ottomans"];
const COLORS = ["Beige", "Gray", "Black", "Green", "Brown"];
const MATERIALS = ["Wood", "Metal", "Upholstery", "Leather"];

const SORTS = [
  { value: "",            label: "Relevance" },
  { value: "price:asc",   label: "Price: Low to High" },
  { value: "price:desc",  label: "Price: High to Low" },
  { value: "title:asc",   label: "Name: A → Z" },
  { value: "title:desc",  label: "Name: Z → A" },
];

function ProductCard({ p }) {
  return (
    <Link to={`/product/${p.id}`} className="pcard">
      <div className="pcard-thumb">
        {p.images?.[0]?.url
          ? <img src={p.images[0].url} alt={p.title} />
          : <div className="pcard-placeholder">{p.type}</div>}
      </div>
      <div className="pcard-body">
        <div className="pcard-type">{p.type}</div>
        <div className="pcard-title">{p.title}</div>
        <div className="pcard-price">₱{Number(p.price || 0).toFixed(2)}</div>
        <div className="pcard-meta muted">Ready to ship</div>
      </div>
    </Link>
  );
}

/* ---------------- Client-side filter helper ---------------- */
function applyFilters(rows, f) {
  const inMin = (p) => (f.priceMin != null ? Number(p.price) >= f.priceMin : true);
  const inMax = (p) => (f.priceMax != null ? Number(p.price) <= f.priceMax : true);

  const matches = rows.filter(p => {
    const typeOk   = !f.type   || p.type === f.type;
    const colorOk  = !f.color  || (p.colors?.includes ? p.colors.includes(f.color) : p.color === f.color);
    const matOk    = !f.material || (p.materials?.includes ? p.materials.includes(f.material) : p.material === f.material);
    const searchOk = !f.search || p.title?.toLowerCase().includes(f.search.toLowerCase());
    const priceOk  = inMin(p) && inMax(p);
    return typeOk && colorOk && matOk && searchOk && priceOk;
  });

  if (f.sort) {
    const [field, dir = "asc"] = f.sort.split(":");
    matches.sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va ?? "").localeCompare(String(vb ?? ""));
    });
    if (dir === "desc") matches.reverse();
  }

  return matches;
}

/* ---------------- Page ---------------- */
export default function AllFurnitures() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);

  // filter state (removed inStock; everything else stays)
  const [filters, setFilters] = useState({
    type: "",
    color: "",
    material: "",
    priceMin: null,
    priceMax: null,
    search: "",
    sort: "", // relevance by default
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await listProducts();
      if (!cancelled) { setRaw(rows || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (!raw) return [];
    return applyFilters(raw, filters);
  }, [raw, filters]);

  const setPrice = (min, max) => setFilters(f => ({ ...f, priceMin: min, priceMax: max }));

  return (
    <div className="catalog">
      <div className="container" style={{ display: "flex", gap: 24 }}>
        {/* Sidebar */}
        <aside className="filters" style={{ minWidth: 260 }}>
          <div className="filters-head">ALL FURNITURES</div>


          {/* Type */}
          <div className="filter-group">
            <div className="filter-title">Type</div>
            <ul>
              <li>
                <label>
                  <input
                    type="radio"
                    name="type"
                    checked={!filters.type}
                    onChange={() => setFilters(f => ({ ...f, type: "" }))}
                  /> <span>All</span>
                </label>
              </li>
              {TYPES.map(t => (
                <li key={t}>
                  <label>
                    <input
                      type="radio"
                      name="type"
                      checked={filters.type === t}
                      onChange={() => setFilters(f => ({ ...f, type: t }))}
                    /> <span>{t}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Color */}
          <div className="filter-group">
            <div className="filter-title">Color</div>
            <ul>
              <li>
                <label>
                  <input
                    type="radio"
                    name="color"
                    checked={!filters.color}
                    onChange={() => setFilters(f => ({ ...f, color: "" }))}
                  /> <span>All</span>
                </label>
              </li>
              {COLORS.map(c => (
                <li key={c}>
                  <label>
                    <input
                      type="radio"
                      name="color"
                      checked={filters.color === c}
                      onChange={() => setFilters(f => ({ ...f, color: c }))}
                    /> <span>{c}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Material */}
          <div className="filter-group">
            <div className="filter-title">Material</div>
            <ul>
              <li>
                <label>
                  <input
                    type="radio"
                    name="material"
                    checked={!filters.material}
                    onChange={() => setFilters(f => ({ ...f, material: "" }))}
                  /> <span>All</span>
                </label>
              </li>
              {MATERIALS.map(m => (
                <li key={m}>
                  <label>
                    <input
                      type="radio"
                      name="material"
                      checked={filters.material === m}
                      onChange={() => setFilters(f => ({ ...f, material: m }))}
                    /> <span>{m}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Price */}
          <div className="filter-group">
            <div className="filter-title">Price</div>
            <ul>
              <li><label><input type="radio" name="price" checked={filters.priceMin==null && filters.priceMax==null} onChange={() => setPrice(null, null)} /> <span>All</span></label></li>
              <li><label><input type="radio" name="price" checked={filters.priceMin===0    && filters.priceMax===1999} onChange={() => setPrice(0, 1999)} /> <span>₱0 – ₱1999</span></label></li>
              <li><label><input type="radio" name="price" checked={filters.priceMin===2000 && filters.priceMax===3999} onChange={() => setPrice(2000, 3999)} /> <span>₱2000 – ₱3999</span></label></li>
              <li><label><input type="radio" name="price" checked={filters.priceMin===4000 && filters.priceMax==null} onChange={() => setPrice(4000, null)} /> <span>₱4000+</span></label></li>
            </ul>
          </div>

          {/* Clear */}
          <button
            className="ghost-btn"
            onClick={() =>
              setFilters({
                type: "", color: "", material: "", priceMin: null, priceMax: null, search: "", sort: ""
              })
            }
          >
            Clear filters
          </button>
        </aside>

        {/* Right column (toolbar + grid) */}
        <section style={{ flex: 1 }}>
          {/* Toolbar with Sort on top-right */}
          <div
            className="catalog-toolbar"
            style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", margin: "0 0 12px" }}
          >
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Sort:</span>
              <select
                value={filters.sort}
                onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value }))}
                style={{ padding: "8px 12px", border: "1px solid #c9c0b2", borderRadius: 8 }}
              >
                {SORTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Grid */}
          <div className="grid">
            {loading && (
              <div className="muted" style={{ gridColumn: "1/-1" }}>Loading…</div>
            )}
            {!loading && products.length === 0 && (
              <div className="muted" style={{ gridColumn: "1/-1" }}>No products match your filters.</div>
            )}
            {products.map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      </div>

      {/* Pagination (static) */}
      <div className="pagination">
        <div className="container">
          <nav className="pager">
            <a href="#">1</a><a href="#">2</a><a href="#">3</a><a href="#">4</a>
            <a href="#">5</a><a href="#">6</a><a href="#">7</a><a href="#">9+</a>
          </nav>
        </div>
      </div>
    </div>
  );
}
