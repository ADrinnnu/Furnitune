// src/utils/checkoutSelection.js
const KEY = "checkout_items_v1";

export function setCheckoutItems(items) {
  try { sessionStorage.setItem(KEY, JSON.stringify(items || [])); } catch {}
}
export function getCheckoutItems() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function clearCheckoutItems() {
  try { sessionStorage.removeItem(KEY); } catch {}
}
