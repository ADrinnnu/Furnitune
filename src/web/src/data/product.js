// src/data/products.js
import { usingFirebase, db } from "../firebase";
import {
  collection, getDoc, getDocs, doc,
  query, where, orderBy, limit
} from "firebase/firestore";

// ---- Local mock data (edit freely) ----
const localProducts = [
  { id: "1", title: "Sofa",         type: "Sofas",      price: 199.99, colors:["Gray"],  materials:["Upholstery"], dims:{width_cm:180, depth_cm:85, height_cm:88}, images: [] },
  { id: "2", title: "Club",         type: "Chairs",     price: 159.99, colors:["Green"], materials:["Wood"],        dims:{width_cm:70, depth_cm:75, height_cm:85},  images: [] },
  { id: "3", title: "Chaise",       type: "Sofas",      price: 299.99, colors:["Beige"], materials:["Upholstery"],  dims:{width_cm:160, depth_cm:70, height_cm:80}, images: [] },
  { id: "4", title: "Armchair",     type: "Chairs",     price: 129.99, colors:["Black"], materials:["Wood"],        dims:{width_cm:68, depth_cm:72, height_cm:85},  images: [] },
  { id: "5", title: "Accent Chair", type: "Chairs",     price: 179.99, colors:["Brown"], materials:["Leather"],     dims:{width_cm:72, depth_cm:75, height_cm:88},  images: [] },
  { id: "6", title: "Table",        type: "Tables",     price: 89.99,  colors:["Brown"], materials:["Wood"],        dims:{width_cm:120,depth_cm:60, height_cm:75},  images: [] },
];

// Helpers
const fromSnap = (d) => ({ id: d.id, ...d.data?.() });

// ---- Public API your components will use ----
export async function listProducts(opts = {}) {
  // opts can later include filters/sort (type, color, etc.)
  if (!usingFirebase) return localProducts;

  // Minimal Firestore version (no filters yet):
  const snap = await getDocs(collection(db, "products"));
  return snap.docs.map((d) => fromSnap({ id: d.id, data: () => d.data() }));
}

export async function getProduct(idOrSlug) {
  if (!usingFirebase) {
    return localProducts.find((p) => p.id === String(idOrSlug));
  }

  // Try by ID first
  const byId = await getDoc(doc(db, "products", String(idOrSlug)));
  if (byId.exists()) return { id: byId.id, ...byId.data() };

  // Optionally, try by slug
  const q = query(collection(db, "products"), where("slug", "==", String(idOrSlug)));
  const qs = await getDocs(q);
  if (!qs.empty) {
    const d = qs.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}

// Example: list best sellers for Landing
export async function listBestSellers(limitN = 4) {
  if (!usingFirebase) return localProducts.slice(0, limitN);

  const q = query(
    collection(db, "products"),
    where("badges.bestSeller", "==", true),
    orderBy("createdAt", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
