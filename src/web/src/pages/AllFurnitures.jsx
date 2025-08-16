import React from "react";
import "../AllFurnitures.css";

const products = [
  { id: 1,  title: "Sofa",         type: "Sofas",      price: 199.99, rating: 5, reviews: 82, img: "" },
  { id: 2,  title: "Club",         type: "Chairs",     price: 199.99, rating: 4, reviews: 61, img: "" },
  { id: 3,  title: "Chaise",       type: "Sofas",      price: 199.99, rating: 4, reviews: 33, img: "" },
  { id: 4,  title: "Armchair",     type: "Chairs",     price: 199.99, rating: 5, reviews: 47, img: "" },
  { id: 5,  title: "Accent Chair", type: "Chairs",     price: 199.99, rating: 4, reviews: 18, img: "" },
  { id: 6,  title: "Table",        type: "Tables",     price: 199.99, rating: 4, reviews: 25, img: "" },
  { id: 7,  title: "Bench",        type: "Benches",    price: 199.99, rating: 4, reviews: 12, img: "" },
  { id: 8,  title: "Bed",          type: "Beds",       price: 199.99, rating: 5, reviews: 31, img: "" },
  { id: 9,  title: "Loveseat",     type: "Sofas",      price: 199.99, rating: 4, reviews: 44, img: "" },
  { id: 10, title: "Daybed",       type: "Beds",       price: 199.99, rating: 4, reviews: 22, img: "" },
  { id: 11, title: "Sectional",    type: "Sectionals", price: 199.99, rating: 5, reviews: 53, img: "" },
  { id: 12, title: "Headboard",    type: "Beds",       price: 199.99, rating: 3, reviews: 9,  img: "" },
  { id: 13, title: "Sofa Bed",     type: "Sofas",      price: 199.99, rating: 4, reviews: 41, img: "" },
  { id: 14, title: "Settee",       type: "Chairs",     price: 199.99, rating: 4, reviews: 36, img: "" },
  { id: 15, title: "Ottoman",      type: "Ottomans",   price: 199.99, rating: 5, reviews: 27, img: "" },
  { id: 16, title: "Coffee Table", type: "Tables",     price: 199.99, rating: 4, reviews: 30, img: "" },
  { id: 17, title: "Lounge Chair", type: "Chairs",     price: 199.99, rating: 4, reviews: 21, img: "" },
  { id: 18, title: "Shell Chair",  type: "Chairs",     price: 199.99, rating: 5, reviews: 19, img: "" },
];

function Stars({ count = 0 }) {
  return (
    <span aria-label={`${count} star rating`} className="stars">
      {"★★★★★☆☆☆☆☆".slice(5 - Math.min(count, 5), 10 - Math.min(count, 5))}
    </span>
  );
}

function ProductCard({ p }) {
  return (
    <article className="pcard">
      <div className="pcard-thumb">
        {p.img
          ? <img src={p.img} alt={p.title} />
          : <div className="pcard-placeholder">{p.type}</div>}
      </div>
      <div className="pcard-body">
        <div className="pcard-type">{p.type}</div>
        <div className="pcard-title">{p.title}</div>
        <div className="pcard-price">₱{p.price.toFixed(2)}</div>
        <div className="pcard-meta">
          <Stars count={p.rating} /> <span className="muted">• {p.reviews} Reviews</span>
        </div>
      </div>
    </article>
  );
}

const FilterGroup = ({ title, items }) => (
  <div className="filter-group">
    <div className="filter-title">{title}</div>
    <ul>
      {items.map((x) => (
        <li key={x}>
          <label><input type="checkbox" /> <span>{x}</span></label>
        </li>
      ))}
    </ul>
  </div>
);

export default function AllFurnitures() {
  return (
    <div className="catalog">
      {/* Removed the duplicate bottom toolbar block */}
      <div className="container catalog-main">
        <aside className="filters">
          <div className="filters-head">ALL FURNITURES</div>
          <FilterGroup
            title="Type"
            items={["Beds", "Sofas", "Chairs", "Tables", "Benches", "Sectionals", "Ottomans"]}
          />
          <FilterGroup title="Color" items={["Beige", "Gray", "Black", "Green", "Brown"]} />
          <FilterGroup title="Price" items={["₱0 – ₱1999", "₱2000 – ₱3999", "₱4000+"]} />
          <FilterGroup title="Material" items={["Wood", "Metal", "Upholstery", "Leather"]} />
          <FilterGroup title="Stock" items={["In stock", "Pre-order"]} />
        </aside>

        <section className="grid">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </section>
      </div>

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
