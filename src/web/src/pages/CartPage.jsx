// src/pages/CartPage.jsx
import React from "react";
import { useCart } from "../state/CartContext";
import { Link } from "react-router-dom";

export default function CartPage() {
  const { cartItems, removeFromCart, clearCart, incrementQuantity, decrementQuantity } = useCart();

  if (cartItems.length === 0) {
    return (
      <div>
        <p>Your cart is empty</p>
        <Link to="/all-furnitures">Browse Products</Link>
      </div>
    );
  }

  return (
    <div>
      {cartItems.map(item => (
        <div key={item.id} className="cart-item">
          <img src={item.thumb} alt={item.title} />
          <div>{item.title}</div>
          <div>₱{item.price}</div>
          <div>
            <button onClick={() => decrementQuantity(item.id)}>-</button>
            {item.qty}
            <button onClick={() => incrementQuantity(item.id)}>+</button>
          </div>
          <button onClick={() => removeFromCart(item.id)}>Remove</button>
        </div>
      ))}
      <div>
        <button onClick={clearCart}>Clear Cart</button>
        <Link to="/checkout">Proceed to Checkout</Link>
      </div>
    </div>
  );
}
