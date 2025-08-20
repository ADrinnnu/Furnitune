import React, { useMemo, useState } from "react";
import "../AllFurnitures.css";

/* ---------- Demo data (add color/material/stock so filters work) ---------- */
const products = [
  { id: 1,  title: "Sofa",         type: "Sofas",      price: 199.99, rating: 5, reviews: 82, img: "", color:"Gray",  material:"Upholstery", stock:"In stock" },
  { id: 2,  title: "Club",         type: "Chairs",     price: 159.99, rating: 4, reviews: 61, img: "", color:"Green", material:"Wood",        stock:"In stock" },
  { id: 3,  title: "Chaise",       type: "Sofas",      price: 299.99, rating: 4, reviews: 33, img: "", color:"Beige", material:"Upholstery", stock:"Pre-order" },
  { id: 4,  title: "Armchair",     type: "Chairs",     price: 129.99, rating: 5, reviews: 47, img: "", color:"Black", material:"Wood",        stock:"In stock" },
  { id: 5,  title: "Accent Chair", type: "Chairs",     price: 179.99, rating: 4, reviews: 18, img: "", color:"Brown", material:"Leather",     stock:"In stock" },
  { id: 6,  title: "Table",        type: "Tables",     price: 89.99,  rating: 4, reviews: 25, img: "", color:"Brown", material:"Wood",        stock:"In stock" },
  { id: 7,  title: "Bench",        type: "Benches",    price: 149.99, rating: 4, reviews: 12, img: "", color:"Gray",  material:"Wood",        stock:"Pre-order" },
  { id: 8,  title: "Bed",          type: "Beds",       price: 399.99, rating: 5, reviews: 31, img: "", color:"Beige", material:"Upholstery", stock:"In stock" },
  { id: 9,  title: "Loveseat",     type: "Sofas",      price: 219.99, rating: 4, reviews: 44, img: "", color:"Gray",  material:"Upholstery", stock:"In stock" },
  { id: 10, title: "Daybed",       type: "Beds",       price: 279.99, rating: 4, reviews: 22, img: "", color:"Green", material:"Upholstery", stock:"Pre-order" },
  { id: 11, title: "Sectional",    type: "Sectionals", price: 599.99, rating: 5, reviews: 53, img: "", color:"Gray",  material:"Upholstery", stock:"In stock" },
  { id: 12, title: "Headboard",    type: "Beds",       price: 99.99,  rating: 3, reviews: 9,  img: "", color:"Black", material:"Wood",        stock:"In stock" },
  { id: 13, title: "Sofa Bed",     type: "Sofas",      price: 249.99, rating: 4, reviews: 41, img: "", color:"Beige", material:"Upholstery", stock:"In stock" },
  { id: 14, title: "Settee",       type: "Chairs",     price: 139.99, rating: 4, reviews: 36, img: "", color:"Brown", material:"Leather",     stock:"Pre-order" },
  { id: 15, title: "Ottoman",      type: "Ottomans",   price: 79.99,  rating: 5, reviews: 27, img: "", color:"Gray",  material:"Leather",     stock:"In stock" },
  { id: 16, title: "Coffee Table", type: "Tables",     price: 119.99, rating: 4, reviews: 30, img: "", color:"Brown", material:"Wood",        stock:"In stock" },
  { id: 17, title: "Lounge Chair", type: "Chairs",     price: 169.99, rating: 4, reviews: 21, img: "", color:"Green", material:"Wood",        stock:"In stock" },
  { id: 18, title: "Shell Chair",  type: "Chairs",     price: 189.99, rating: 5, reviews: 19, img: "", color:"Black", material:"Leather",     stock:"Pre-order" },
];

/* ---------- UI helpers ---------- */
function Stars({ count = 0 }) {
  return <span className="stars">{"★".repeat(count)}{"☆".repeat(5-count)}</span>;
}

function ProductCard({ p }) {
  return (
    <article className="pcard">
      <div className="pcard-thumb">
        {p.img ? <img src={p.img} alt={p.title}/> : <div className="pcard-placeholder">{p.type}</div>}
      </div>
      <div className="pcard-body">
        <div className="pcard-type">{p.type}</div>
        <div className="pcard-title">{p.title}</div>
        <div className="pcard-price">₱{p.price.toFixed(2)}</div>
        <div className="pcard-meta">
          <Stars count={p.rating}/> <span className="muted">• {p.reviews} Reviews</span>
        </div>
      </div>
    </article>
  );
}

/* ---------- Filter config ---------- */
const TYPE_OPTIONS     = ["Beds","Chairs","Tables","Benches","Ottomans"];
const COLOR_OPTIONS    = ["Beige","Gray","Black","Green","Brown"];
const MATERIAL_OPTIONS = ["Wood","Metal","Upholstery","Leather"];

const PRICE_RANGES = [
  { id:"p1", label:"₱0 – ₱1999",    test:(p)=> p.price < 2000 },
  { id:"p2", label:"₱2000 – ₱3999", test:(p)=> p.price >= 2000 && p.price < 4000 },
  { id:"p3", label:"₱4000+",        test:(p)=> p.price >= 4000 },
];

/* ---------- Filter group component (controlled inputs) ---------- */
function FilterGroup({ title, options, selected, onToggle }) {
  return (
    <div className="filter-group">
      <div className="filter-title">{title}</div>
      <ul>
        {options.map(opt => (
          <li key={opt}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => onToggle(opt)}
              />
              <span>{opt}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Page ---------- */
export default function AllFurnitures(){
  // sets for multi-select filters
  const [types, setTypes]         = useState(new Set());
  const [colors, setColors]       = useState(new Set());
  const [materials, setMaterials] = useState(new Set());
  const [prices, setPrices]       = useState(new Set()); // store range ids
  const [sortBy, setSortBy]       = useState("relevance"); // priceAsc|priceDesc|rating|reviews|name

  // togglers
  const toggle = (set) => (value) =>
    set(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const filteredProducts = useMemo(() => {
    let list = products.filter(p => {
      if (types.size     && !types.has(p.type))         return false;
      if (colors.size    && !colors.has(p.color))       return false;
      if (materials.size && !materials.has(p.material)) return false;
      if (prices.size) {
        // at least one selected range must match
        const match = [...prices].some(id => PRICE_RANGES.find(r=>r.id===id)?.test(p));
        if (!match) return false;
      }
      return true;
    });

    switch (sortBy) {
      case "priceAsc":  list.sort((a,b)=>a.price-b.price); break;
      case "priceDesc": list.sort((a,b)=>b.price-a.price); break;
      case "rating":    list.sort((a,b)=>b.rating-a.rating); break;
      case "reviews":   list.sort((a,b)=>b.reviews-a.reviews); break;
      case "name":      list.sort((a,b)=>a.title.localeCompare(b.title)); break;
      default:          /* relevance: keep original order */ break;
    }
    return list;
  }, [types, colors, materials, prices, sortBy]);

  return (
    <div className="catalog">
      <div className="container catalog-main">
        {/* Sidebar */}
        <aside className="filters">
          <div className="filters-head">BEDROOM</div>

          <FilterGroup
            title="Type"
            options={TYPE_OPTIONS}
            selected={types}
            onToggle={toggle(setTypes)}
          />

          <FilterGroup
            title="Color"
            options={COLOR_OPTIONS}
            selected={colors}
            onToggle={toggle(setColors)}
          />

          {/* Price ranges with custom handler */}
          <div className="filter-group">
            <div className="filter-title">Price</div>
            <ul>
              {PRICE_RANGES.map(r => (
                <li key={r.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={prices.has(r.id)}
                      onChange={() => toggle(setPrices)(r.id)}
                    />
                    <span>{r.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <FilterGroup
            title="Material"
            options={MATERIAL_OPTIONS}
            selected={materials}
            onToggle={toggle(setMaterials)}
          />
        </aside>

        {/* Grid + controls */}
        <section>
          <div style={{display:"flex", justifyContent:"flex-end", marginBottom:12}}>
            <label className="muted" style={{display:"flex", alignItems:"center", gap:8}}>
              Sort:
              <select
                value={sortBy}
                onChange={e=>setSortBy(e.target.value)}
                style={{padding:"6px 10px", border:"1px solid #c9c0b2", borderRadius:8}}
              >
                <option value="relevance">Relevance</option>
                <option value="priceAsc">Price: Low to High</option>
                <option value="priceDesc">Price: High to Low</option>
                <option value="rating">Rating</option>
                <option value="reviews">Most Reviews</option>
                <option value="name">Name (A–Z)</option>
              </select>
            </label>
          </div>

          <div className="grid">
            {filteredProducts.map(p => <ProductCard key={p.id} p={p} />)}
            {!filteredProducts.length && (
              <div className="muted" style={{gridColumn:"1/-1", padding:"24px 0"}}>
                No products match your filters.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Pagination (static lang siya) */}
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
