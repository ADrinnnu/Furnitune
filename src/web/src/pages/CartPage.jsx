// src/pages/CartPage.jsx
import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { setCheckoutItems } from "../utils/checkoutSelection";
import "../CartPage.css";

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

export default function CartPage() {
  const navigate = useNavigate();
  const {
    cartItems,
    removeFromCart,
    incrementQuantity,
    decrementQuantity,
    clearCart,
  } = useCart();

  const keyFor = (it) => it.docId || `${it.productId || it.id}__${it.size || "default"}`;

  const [selected, setSelected] = useState(() => new Set());
  const allKeys = useMemo(() => cartItems.map(keyFor), [cartItems]);

  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const noneSelected = selected.size === 0;

  const toggleOne = (k) => {
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((cur) => (allSelected ? new Set() : new Set(allKeys)));
  };

  const selectedItems = useMemo(
    () => cartItems.filter((it) => selected.has(keyFor(it))),
    [cartItems, selected]
  );
  const selectedTotal = useMemo(
    () => selectedItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0),
    [selectedItems]
  );

  // ⬇️ No removal here; just store items and go to checkout
  const handleCheckoutSelected = () => {
    if (!selectedItems.length) return alert("Please select at least one item to check out.");
    const items = selectedItems.map((it) => ({
      productId: it.productId || it.id || "",
      name: it.name || it.title || "Item",
      qty: Number(it.qty || 1),
      price: Number(it.price ?? it.unitPrice ?? it.basePrice ?? 0),
      size: it.size || null,
      image: it.image || it.thumb || "",
    }));
    setCheckoutItems(items);
    navigate("/checkout");
  };

  const handleCheckoutSingle = (item) => {
    const items = [
      {
        productId: item.productId || item.id || "",
        name: item.name || item.title || "Item",
        qty: Number(item.qty || 1),
        price: Number(item.price ?? item.unitPrice ?? item.basePrice ?? 0),
        size: item.size || null,
        image: item.image || item.thumb || "",
      },
    ];
    setCheckoutItems(items);
    navigate("/checkout");
  };

  if (!cartItems.length) {
    return (
      <div className="cart-empty container">
        <p>Your cart is empty.</p>
        <Link to="/all" className="btn-link">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="cart-wrap container">
      <div className="cart-toolbar">
        <label className="select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>Select all</span>
        </label>
        <button className="link danger" onClick={clearCart}>Clear cart</button>
      </div>

      <div className="cart-list">
        {cartItems.map((it) => {
          const k = keyFor(it);
          const isChecked = selected.has(k);
          return (
            <div className="cart-card" key={k}>
              <div className="cart-check">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(k)}
                  aria-label="Select item"
                />
              </div>

              <div className="cart-main">
                <div className="cart-line">
                  <img
                    src={it.thumb || it.image || "/placeholder.jpg"}
                    alt={it.title || it.name || "Product"}
                    className="cart-thumb"
                    onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
                  />
                  <div className="cart-info">
                    <div className="cart-title">{it.title || it.name || "Item"}</div>
                    <div className="cart-sub">
                      {it.size ? <span className="muted">Size: {it.size}</span> : null}
                      <span className="muted">Qty: {it.qty}</span>
                    </div>

                    <div className="qty-row">
                      <button
                        className="qty-btn"
                        onClick={() => decrementQuantity(it.docId || it.id)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="qty-val">{it.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => incrementQuantity(it.docId || it.id)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cart-side">
                <div className="cart-price">{peso((it.price || 0) * (it.qty || 1))}</div>
                <button
                  className="icon-btn danger"
                  title="Remove"
                  aria-label="Remove"
                  onClick={() => removeFromCart(it.docId || it.id)}
                >
                  🗑️
                </button>
              </div>

              <div className="cart-action">
                <button className="checkout-btn" onClick={() => handleCheckoutSingle(it)}>
                  CHECK OUT
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cart-summary-bar">
        <div className="summary-left">
          <span className="muted">
            Selected: {selected.size} {selected.size === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="summary-right">
          <div className="sum-total">{peso(selectedTotal)}</div>
          <button
            className="checkout-btn"
            disabled={noneSelected}
            onClick={handleCheckoutSelected}
          >
            CHECK OUT
          </button>
        </div>
      </div>
    </div>
  );
}
