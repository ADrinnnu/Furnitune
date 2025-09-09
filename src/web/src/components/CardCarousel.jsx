import { collection } from "firebase/firestore";
import React from "react";
import Collections from "../pages/Collections";
import { Link } from "react-router-dom";


export default function CardCarousel({ items = [], type = "product" }) {
  return (
    <div className="carousel">
      {items.map((item) => (
        <article key={item.id} className="product-cards">
          {type === "collection" ? (
            <Link to="/collections">
              <img src={item.img} alt={item.title} className="card-image" />
            </Link>
          ) : (
            <img src={item.img} alt={item.title} className="card-image" />
          )}

          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <strong>{item.title}</strong>

            {type === "product" ? (
              <>
                <span className="muted">{item.price}</span>
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
      ))}
    </div>
  );
}