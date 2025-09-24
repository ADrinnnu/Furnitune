// src/components/OrderSummaryCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  auth, firestore, storage,
  collection, query, where, getDocs,
  doc, getDoc,
  ref, getDownloadURL,
} from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

/* ---------- helpers ---------- */
function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (/^gs:\/\//i.test(u)) {
    const s = u.replace(/^gs:\/\//i, ""); const i = s.indexOf("/");
    return i > -1 ? s.slice(i + 1) : null;
  }
  if (u.includes("firebasestorage.googleapis.com")) {
    const m = u.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (!/^https?:\/\//i.test(u)) return u;
  return null;
}
async function resolveStorageUrl(val) {
  if (!val) return "";
  try {
    const path = objectPathFromAnyStorageUrl(val);
    if (path) return await getDownloadURL(ref(storage, path));
    return val;
  } catch { return ""; }
}
const peso = (v) => `₱${Number(v || 0).toLocaleString("en-PH")}`;

/* ---------- component ---------- */
export default function OrderSummaryCard({
  items: passedItems,
  orderId,
  title = "ORDER SUMMARY",
  className = "",
  subtotalOverride,
  discount = 0,
  shippingFee = 0,
  totalOverride,

  // Order Summary–only bits
  showAddress = false,      // controls Delivery Address render
  shippingAddress = null,   // optional address (still gated by showAddress)
  showSupport = true,       // controls the “Need Assistance?” box
}) {
  const [order, setOrder] = useState(undefined);
  const [items, setItems] = useState([]);

  // If items are provided (Checkout flow)
  useEffect(() => {
    (async () => {
      if (!passedItems) return;
      const withUrls = await Promise.all(
        passedItems.map(async (it) => ({
          ...it,
          imageUrl: await resolveStorageUrl(it.image || it.imageUrl || ""),
        }))
      );
      setItems(withUrls);
      setOrder({ items: withUrls });
    })();
  }, [passedItems]);

  // Otherwise load one order or latest for user
  useEffect(() => {
    if (passedItems) return;
    let mounted = true;
    let stopAuth = () => {};

    async function fetchById(id) {
      const snap = await getDoc(doc(firestore, "orders", id));
      if (!mounted) return;
      setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }
    async function fetchLatest(uid) {
      if (!uid) { setOrder(null); return; }
      const qRef = query(collection(firestore, "orders"), where("userId", "==", uid));
      const snap = await getDocs(qRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis?.() ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });
      setOrder(list.length ? list[list.length - 1] : null);
    }

    (async () => {
      if (orderId) await fetchById(orderId);
      else {
        const uid = auth.currentUser?.uid;
        if (uid) await fetchLatest(uid);
        else {
          stopAuth = onAuthStateChanged(auth, async (u) => {
            await fetchLatest(u?.uid || null);
            stopAuth();
          });
        }
      }
    })();

    return () => { mounted = false; try { stopAuth(); } catch {} };
  }, [orderId, passedItems]);

  // Normalize images for fetched order
  useEffect(() => {
    if (passedItems) return;
    (async () => {
      const src = order?.items || [];
      const withUrls = await Promise.all(
        src.map(async (it) => ({
          ...it,
          imageUrl: await resolveStorageUrl(it.image || it.imageUrl || it.photo || ""),
        }))
      );
      setItems(withUrls);
    })();
  }, [order, passedItems]);

  const subtotal = useMemo(() => {
    if (subtotalOverride != null) return Number(subtotalOverride);
    if (order?.subtotal != null && !passedItems) return Number(order.subtotal);
    const src = passedItems || order?.items || [];
    return src.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 1)), 0);
  }, [order, passedItems, subtotalOverride]);

  const disc = Number(discount || order?.discount || 0);
  const ship = Number(shippingFee || order?.shippingFee || order?.shipping || 0);
  const total = useMemo(() => {
    if (totalOverride != null) return Number(totalOverride);
    if (order?.total != null && !passedItems) return Number(order.total);
    return Math.max(0, subtotal - disc + ship);
  }, [order, passedItems, subtotal, disc, ship, totalOverride]);

  const addr = useMemo(() => shippingAddress || order?.shippingAddress || null, [order, shippingAddress]);

  /* ---- states ---- */
  if (order === undefined) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img src="/placeholder.jpg" alt="Loading" />
          <div className="cart-info"><p>Loading…</p><span>Qty: —</span></div>
          <span className="price">—</span>
        </div>
        <div className="summary-totals">
          <div><span>Subtotal</span><span>—</span></div>
          <div><span>Discount</span><span>—</span></div>
          <div><span>Shipping &amp; Handling</span><span>—</span></div>
        </div>
        <div className="summary-total"><strong>TOTAL</strong><strong>—</strong></div>

        {showSupport && (
          <div className="support-box">
            <h4>NEED ASSISTANCE?</h4>
            <p>💬 Live Chat: Offline now</p>
            <p>📞 Call: 123-325-312</p>
            <p>✉️ Email: Furnitune@jserwj.com</p>
          </div>
        )}
      </div>
    );
  }
  if (order === null && !passedItems) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img src="/placeholder.jpg" alt="No order" />
          <div className="cart-info"><p>No order</p><span>Qty: —</span></div>
          <span className="price">—</span>
        </div>
      </div>
    );
  }

  const lineItems = items.length ? items : (order.items || []);
  const count = lineItems.reduce((s, it) => s + (Number(it.qty || 1)), 0);

  return (
    <div className={`checkout-summary ${className}`}>
      <h3>{title}</h3>

      <div className="cart-header">🛒 Cart ({count})</div>

      {lineItems.map((it, i) => {
        const name = it.name || it.title || `Item #${i + 1}`;
        const qty  = Number(it.qty || 1);
        const price = Number(it.price || 0);
        return (
          <div className="cart-item" key={(it.id || it.productId || i) + ""}>
            <img
              src={it.imageUrl || it.image || "/placeholder.jpg"}
              alt={name}
              onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; }}
            />
            <div className="cart-info">
              <p>{name}</p>
              <span>Qty: {qty}</span>
              {(it?.colorName || it?.colorHex) && (
                <span>
                  {/* simple text only; no CSS changes */}
                  Color: {it.colorName || "—"}{it.colorHex ? ` (${it.colorHex})` : ""}
                </span>
              )}
            </div>
            <span className="price">{peso(price)}</span>
          </div>
        );
      })}

      {showAddress && addr && (
        <div className="delivery-section">
          <h4>DELIVERY ADDRESS</h4>
          <p>{addr.fullName || [addr.firstName, addr.lastName].filter(Boolean).join(" ")}</p>
          {addr.phone && <p>{addr.phone}</p>}
          <p>
            {[addr.line1, addr.line2, addr.city, addr.province, addr.zip]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      )}

      <div className="summary-totals">
        <div><span>Subtotal</span><span>{peso(subtotal)}</span></div>
        <div><span>Discount</span><span>-{peso(disc)}</span></div>
        <div><span>Shipping &amp; Handling</span><span>{peso(ship)}</span></div>
      </div>
      <div className="summary-total">
        <strong>TOTAL</strong>
        <strong>{peso(total)}</strong>
      </div>

      {showSupport && (
        <div className="support-box">
          <h4>NEED ASSISTANCE?</h4>
          <p>💬 Live Chat: Offline now</p>
          <p>📞 Call: 123-325-312</p>
          <p>✉️ Email: Furnitune@jserwj.com</p>
        </div>
      )}
    </div>
  );
}
