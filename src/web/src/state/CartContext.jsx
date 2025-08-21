import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const CartContext = createContext();

function cartReducer(state, action) {
  switch (action.type) {
    case "INIT":
      return action.payload || [];
    case "ADD": {
      const { id, title, price, thumb, type } = action.item;
      const existing = state.find((i) => i.id === id);
      if (existing) {
        return state.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...state, { id, title, price, thumb, type, qty: 1 }];
    }
    case "INC":
      return state.map((i) => (i.id === action.id ? { ...i, qty: i.qty + 1 } : i));
    case "DEC":
      return state
        .map((i) => (i.id === action.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))
        .filter(Boolean);
    case "REMOVE":
      return state.filter((i) => i.id !== action.id);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, []);

  // load once
  useEffect(() => {
    const saved = localStorage.getItem("cart_v1");
    if (saved) dispatch({ type: "INIT", payload: JSON.parse(saved) });
  }, []);
  // persist
  useEffect(() => {
    localStorage.setItem("cart_v1", JSON.stringify(items));
  }, [items]);

  const count = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.qty, 0),
    [items]
  );

  const api = {
    items,
    count,
    subtotal,
    add: (item) => dispatch({ type: "ADD", item }),
    inc: (id) => dispatch({ type: "INC", id }),
    dec: (id) => dispatch({ type: "DEC", id }),
    remove: (id) => dispatch({ type: "REMOVE", id }),
    clear: () => dispatch({ type: "CLEAR" }),
  };

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}
export const useCart = () => useContext(CartContext);
