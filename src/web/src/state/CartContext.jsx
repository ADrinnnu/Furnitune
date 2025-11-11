// src/state/CartContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { auth, firestore } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  writeBatch,
  serverTimestamp,
  increment as fvIncrement,
} from "firebase/firestore";

/* --------------------------- helpers --------------------------- */

// include color in the document id so web+app match
function cartDocIdFor(item) {
  const pid = item.productId || item.id || "unknown";
  const size = (item.size || item.selectedSize || "").toString().trim() || "default";
  const color =
    (item.selectedColor || item.colorName || item.color || "").toString().trim() || "default";
  return `${pid}__${size}__${color}`;
}

// write BOTH schemas (app schema + old fields) for compatibility
function toPersisted(item) {
  const productId = item.productId || item.id;

  const selectedSize = item.selectedSize ?? item.size ?? null;
  const selectedColor = item.selectedColor ?? item.colorName ?? null;
  const imageUrl = item.imageUrl || item.image || item.thumb || "";

  const qty = Number(item.qty || 1);
  const price = Number(item.price || 0);

  return {
    // --- app schema fields (mobile expects these) ---
    createdAt: serverTimestamp(),
    imageUrl,
    name: item.name || item.title || "Item",
    note: item.note ?? item.notes ?? null,
    price,
    productId,
    qty,
    selectedColor,
    selectedSize,
    userId: auth.currentUser ? auth.currentUser.uid : null,

    // --- keep your old fields so nothing else breaks ---
    title: item.title || item.name || "Item",
    size: selectedSize,
    thumb: imageUrl,
    image: imageUrl,
    updatedAt: serverTimestamp(),
  };
}

function toUiItem(data, docId) {
  return {
    // core
    id: data.productId,
    productId: data.productId,
    title: data.title || data.name || "Item",
    name: data.name || data.title || "Item",
    price: Number(data.price || 0),
    qty: Number(data.qty || 1),

    // old + new shape for UI
    size: data.size || data.selectedSize || null,
    selectedSize: data.selectedSize ?? data.size ?? null,
    selectedColor: data.selectedColor ?? null,
    thumb: data.thumb || data.image || data.imageUrl || "",
    image: data.image || data.thumb || data.imageUrl || "",
    imageUrl: data.imageUrl || data.image || data.thumb || "",

    docId,
  };
}

/* --------------------------- context --------------------------- */

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [user, setUser] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const subRef = useRef(null);

  const guestBufferRef = useRef([]);

  useEffect(() => {
    const stop = onAuthStateChanged(auth, async (u) => {
      if (subRef.current) {
        try {
          subRef.current();
        } catch {}
        subRef.current = null;
      }

      setUser(u || null);

      if (!u) {
        setCartItems([]);
        guestBufferRef.current = [];
        return;
      }

      // merge guest buffer -> user cart
      if (guestBufferRef.current.length) {
        const batch = writeBatch(firestore);
        for (const it of guestBufferRef.current) {
          const key = cartDocIdFor(it);
          const ref = doc(firestore, "users", u.uid, "cart", key);
          batch.set(ref, toPersisted(it), { merge: true });
          batch.update(ref, {
            qty: fvIncrement(it.qty || 1),
            updatedAt: serverTimestamp(),
          });
        }
        try {
          await batch.commit();
        } catch (e) {
          console.warn("Guest → user cart merge failed:", e);
        }
        guestBufferRef.current = [];
      }

      const q = query(collection(firestore, "users", u.uid, "cart"));
      subRef.current = onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => toUiItem(d.data(), d.id));
          setCartItems(rows);
        },
        (err) => {
          console.error("Cart snapshot error:", err);
        }
      );
    });

    return () => stop();
  }, []);

  const cartCount = useMemo(
    () => (cartItems || []).reduce((s, it) => s + Number(it.qty || 0), 0),
    [cartItems]
  );

  /* ------------------------- actions -------------------------- */

  async function addToCart(item) {
    const base = {
      ...item,
      productId: item.productId || item.id,
      qty: Number(item.qty || 1),
    };

    if (!user) {
      const key = cartDocIdFor(base);

      const idx = guestBufferRef.current.findIndex(
        (x) => cartDocIdFor(x) === key
      );
      if (idx >= 0) guestBufferRef.current[idx].qty += base.qty;
      else guestBufferRef.current.push({ ...base });

      setCartItems((cur) => {
        const j = cur.findIndex((x) => cartDocIdFor(x) === key);
        if (j >= 0) {
          const copy = [...cur];
          copy[j] = { ...copy[j], qty: copy[j].qty + base.qty };
          return copy;
        }
        return [...cur, toUiItem(toPersisted(base), key)];
      });
      return;
    }

    try {
      const key = cartDocIdFor(base);
      const ref = doc(firestore, "users", user.uid, "cart", key);
      await setDoc(
        ref,
        {
          ...toPersisted(base),
          qty: fvIncrement(base.qty || 1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("addToCart write failed:", e?.code || e);
      const key = cartDocIdFor(base);
      guestBufferRef.current.push({ ...base });
      setCartItems((cur) => [...cur, toUiItem(toPersisted(base), key)]);
    }
  }

  async function incrementQuantity(idOrDoc) {
    if (!user) {
      setCartItems((cur) =>
        cur.map((it) =>
          it.id === idOrDoc || it.docId === idOrDoc
            ? { ...it, qty: it.qty + 1 }
            : it
        )
      );
      guestBufferRef.current = guestBufferRef.current.map((it) =>
        it.productId === idOrDoc || cartDocIdFor(it) === idOrDoc
          ? { ...it, qty: (it.qty || 1) + 1 }
          : it
      );
      return;
    }
    const item =
      cartItems.find((it) => it.id === idOrDoc) ||
      cartItems.find((it) => it.docId === idOrDoc);
    if (!item) return;
    const ref = doc(
      firestore,
      "users",
      user.uid,
      "cart",
      item.docId || cartDocIdFor(item)
    );
    await updateDoc(ref, {
      qty: fvIncrement(1),
      updatedAt: serverTimestamp(),
    });
  }

  async function decrementQuantity(idOrDoc) {
    if (!user) {
      setCartItems((cur) => {
        const found =
          cur.find((it) => it.id === idOrDoc) ||
          cur.find((it) => it.docId === idOrDoc);
        if (!found) return cur;
        if (found.qty <= 1)
          return cur.filter((it) => !(it === found));
        return cur.map((it) =>
          it === found ? { ...it, qty: it.qty - 1 } : it
        );
      });
      guestBufferRef.current = guestBufferRef.current.reduce((acc, it) => {
        if (it.productId === idOrDoc || cartDocIdFor(it) === idOrDoc) {
          if ((it.qty || 1) > 1) acc.push({ ...it, qty: it.qty - 1 });
        } else acc.push(it);
        return acc;
      }, []);
      return;
    }
    const item =
      cartItems.find((it) => it.id === idOrDoc) ||
      cartItems.find((it) => it.docId === idOrDoc);
    if (!item) return;
    const ref = doc(
      firestore,
      "users",
      user.uid,
      "cart",
      item.docId || cartDocIdFor(item)
    );
    if (item.qty <= 1) await deleteDoc(ref);
    else
      await updateDoc(ref, {
        qty: fvIncrement(-1),
        updatedAt: serverTimestamp(),
      });
  }

  async function removeFromCart(idOrDoc) {
    if (!user) {
      setCartItems((cur) =>
        cur.filter((it) => !(it.id === idOrDoc || it.docId === idOrDoc))
      );
      guestBufferRef.current = guestBufferRef.current.filter(
        (it) =>
          !(it.productId === idOrDoc || cartDocIdFor(it) === idOrDoc)
      );
      return;
    }
    const item =
      cartItems.find((it) => it.id === idOrDoc) ||
      cartItems.find((it) => it.docId === idOrDoc);
    if (!item) return;
    const ref = doc(
      firestore,
      "users",
      user.uid,
      "cart",
      item.docId || cartDocIdFor(item)
    );
    await deleteDoc(ref);
  }

  async function clearCart() {
    if (!user) {
      setCartItems([]);
      guestBufferRef.current = [];
      return;
    }
    const batch = writeBatch(firestore);
    for (const it of cartItems) {
      batch.delete(
        doc(
          firestore,
          "users",
          user.uid,
          "cart",
          it.docId || cartDocIdFor(it)
        )
      );
    }
    await batch.commit();
  }

  const value = {
    cartItems,
    cartCount,
    addToCart,
    removeFromCart,
    incrementQuantity,
    decrementQuantity,
    clearCart,
  };

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}
