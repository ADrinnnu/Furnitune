// src/hooks/useProductSearch.js
import * as React from "react";
import { firestore, collection, getDocs } from "../firebase";

let _cache = null;

async function loadAllProducts() {
  if (_cache) return _cache;
  const snap = await getDocs(collection(firestore, "products"));
  _cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return _cache;
}

function filterLocal(list, term) {
  const s = term.trim().toLowerCase();
  if (!s) return [];
  return list
    .filter((p) => {
      const name = (p.name || p.title || "").toLowerCase();
      const type = (p.baseType || p.type || "").toLowerCase();
      const cat = (p.categorySlug || "").toLowerCase();
      return name.includes(s) || type.includes(s) || cat.includes(s);
    })
    .slice(0, 10);
}

export function useProductSearch() {
  const [loading, setLoading] = React.useState(false);

  const search = React.useCallback(async (term) => {
    const q = term.trim();
    if (!q) return [];
    setLoading(true);
    try {
      const list = await loadAllProducts();
      return filterLocal(list, q);
    } finally {
      setLoading(false);
    }
  }, []);

  return { search, loading };
}
