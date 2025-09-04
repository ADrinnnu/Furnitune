import { collection } from "firebase/firestore";
import React from "react";
import Collections from "../pages/Collections";
import { Link } from "react-router-dom";

export default function CardCarousel({ items = [], type='product' }){
  return (
    <div className="carousel">
      {items.map(item => (
        <article key={item.id} className="product-cards">
           <Link to="/collections">
            <img src={item.img} alt={item.title} />
          </Link>
          <div style={{marginTop:10,display:'grid',gap:6}}>
            <strong>{item.title}</strong>
            {type === 'product'
              ? <span className="muted">{item.price}</span>
              : <span className="muted">Curated set</span>}
            <div style={{display:'flex',gap:10}}>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
