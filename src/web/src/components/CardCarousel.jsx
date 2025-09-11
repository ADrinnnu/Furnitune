// src/components/CardCarousel.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function CardCarousel({ items = [], type = "product" }) {
  return (
    <div className="carousel">
      {items.map((item, idx) => {
        const dest =
          item?.to ||
          item?.link ||
          item?.href ||
          (type === "product" && item?.id ? `/product/${item.id}` : null);

        const imageEl = (
          <img
            src={item.img}
            alt={item.title || "item"}
            className="card-image"
          />
        );

        return (
          <article key={item.id || idx} className="product-cards">
            {dest ? <Link to={dest}>{imageEl}</Link> : imageEl}

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <strong>{item.title}</strong>

              {type === "product" ? (
                <>
                  {item.price && <span className="muted">{item.price}</span>}
                  {item.description && (
                    <p className="description">{item.description}</p>
                  )}
                </>
              ) : (
                <>
                  {item.description ? (
                    <p className="description">{item.description}</p>
                  ) : (
                    <span className="muted">Curated set</span>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
