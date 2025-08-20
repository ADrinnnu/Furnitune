// src/contexts/CartContext.jsx
import React, { createContext, useContext, useMemo, useState } from "react";

const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]); // [{id, qty, product}]

  const addToCart = (product, qty = 1) => {
    setItems((prev) => {
      const i = prev.find((x) => x.product.id === product.id);
      if (i) return prev.map((x) => (x.product.id === product.id ? { ...x, qty: x.qty + qty } : x));
      return [...prev, { id: product.id, qty, product }];
    });
  };
  const removeFromCart = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  const clearCart = () => setItems([]);

  const count = items.reduce((n, x) => n + x.qty, 0);
  const total = items.reduce((sum, x) => sum + x.qty * (x.product.price || 0), 0);

  const value = useMemo(() => ({ items, addToCart, removeFromCart, clearCart, count, total }), [items]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
