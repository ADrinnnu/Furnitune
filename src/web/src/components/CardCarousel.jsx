import React from "react";

export default function CardCarousel({ items = [], type='product' }){
  return (
    <div className="carousel">
      {items.map(item => (
        <article key={item.id} className="product-card">
          <img src={item.img} alt={item.title} />
          <div style={{marginTop:10,display:'grid',gap:6}}>
            <strong>{item.title}</strong>
            {type === 'product'
              ? <span className="muted">{item.price}</span>
              : <span className="muted">Curated set</span>}
            <div style={{display:'flex',gap:10}}>
              <button className="btn" style={{padding:'.55rem .9rem'}}>View</button>
              <button className="btn ghost" style={{padding:'.55rem .9rem'}}>Add to cart</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
