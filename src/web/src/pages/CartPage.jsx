// src/pages/CartPage.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { setCheckoutItems } from "../utils/checkoutSelection";

export default function CartPage() {
  const navigate = useNavigate();
  const {
    cartItems = [],
    removeFromCart,
    clearCart,
    incrementQuantity,
    decrementQuantity,
  } = useCart();

  function handleCheckoutFromCart() {
    const items = (cartItems || []).map((it) => ({
      productId: it.id || it.productId || "",
      name: it.name || it.title || "Item",
      qty: Number(it.qty || 1),
      // prefer explicit price fields you use in the cart; fallbacks included
      price: Number(it.price ?? it.unitPrice ?? it.basePrice ?? 0),
      size: it.size || it.variant || null,
      image:
        it.imageUrl ||
        it.image ||
        it.thumb ||
        (Array.isArray(it.images) ? it.images[0] : "") ||
        "",
    }));

    if (!items.length) {
      alert("Your cart is empty.");
      return;
    }

    setCheckoutItems(items);
    navigate("/checkout");
  }

  if (!cartItems.length) {
    return (
      <div>
        <p>Your cart is empty</p>
        <Link to="/all-furnitures">Browse Products</Link>
      </div>
    );
  }

  return (
    <div>
      {cartItems.map((item) => (
        <div key={item.id} className="cart-item">
          <img
            src={item.thumb || item.image || "/placeholder.jpg"}
            alt={item.title || item.name || "Product"}
            onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
          />
          <div>{item.title || item.name}</div>
          <div>₱{Number(item.price ?? 0).toLocaleString()}</div>
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

        {/* Use a button so we can set checkout items, then navigate */}
        <button onClick={handleCheckoutFromCart}>Proceed to Checkout</button>
      </div>
    </div>
  );
}
