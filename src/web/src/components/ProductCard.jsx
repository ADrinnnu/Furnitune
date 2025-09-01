// src/components/ProductCard.jsx
import React from "react";
import { useCart } from "../state/CartContext";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();

  return (
    <div className="pcard">
      <div className="pcard-thumb">
        <img src={product.thumb} alt={product.title} />
      </div>
      <div className="pcard-body">
        <div className="pcard-type">{product.type}</div>
        <div className="pcard-title">{product.title}</div>
        <div className="pcard-price">₱{product.price}</div>
        <button onClick={() => addToCart(product)}>Add to Cart</button>
      </div>
    </div>
  );
}
