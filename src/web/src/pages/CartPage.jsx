import React from "react";

export default function CartPage() {
  // later connect to context or firestore
  const items = []; // placeholder

  return (
    <div className="container section">
      <h1>My Cart</h1>
      {items.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <span>{item.title}</span>
              <span>{item.price}</span>
            </div>
          ))}
          <button className="btn">Checkout</button>
        </div>
      )}
    </div>
  );
}
