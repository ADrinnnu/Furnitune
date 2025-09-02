import React from "react";

export default function CardCarousel({ items = [], type='product' }){
  return (
    <div className="carousel">
      {items.map(item => (
        <article key={item.id} className="product-cards">
          <img src={item.img} alt={item.title} />
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
