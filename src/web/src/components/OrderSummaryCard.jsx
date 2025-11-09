// src/components/OrderSummaryCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  auth, firestore, storage,
  collection, query, where, getDocs,
  doc, getDoc,
  ref, getDownloadURL,
} from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import "../OrderSummary.css";

/* ---------- built-in placeholder (no file needed) ---------- */
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90">
      <rect width="120" height="90" rx="10" fill="#f3f4f6"/>
      <path d="M15 65l18-22 14 16 12-14 26 32H15z" fill="#d1d5db"/>
      <circle cx="78" cy="35" r="8" fill="#e5e7eb"/>
    </svg>`
  );

/* ---------- helpers ---------- */
function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (/^gs:\/\//i.test(u)) {
    const s = u.replace(/^gs:\/\//i, "");
    const i = s.indexOf("/");
    return i > -1 ? s.slice(i + 1) : null;
  }
  if (u.includes("firebasestorage.googleapis.com")) {
    const m = u.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (!/^https?:\/\//i.test(u)) return u; // looks like a storage path already
  return null;
}
function isStorageLikeUrl(u) {
  return !!objectPathFromAnyStorageUrl(u);
}
async function resolveStorageUrl(val) {
  if (!val) return "";
  try {
    const path = objectPathFromAnyStorageUrl(val);
    if (path) return await getDownloadURL(ref(storage, path));
    return val; // plain http(s) URL
  } catch {
    return "";
  }
}
function safeImageSrc(primaryResolvedUrl, original) {
  // Prefer resolved URL when present.
  if (primaryResolvedUrl) return primaryResolvedUrl;
  // If original looks like a Storage URL and we couldn't resolve it, DO NOT render it.
  if (isStorageLikeUrl(original)) return PLACEHOLDER;
  // Otherwise (external http image), try original; onError will still fall back.
  return original || PLACEHOLDER;
}
const peso = (v) => `₱${Number(v || 0).toLocaleString("en-PH")}`;
const toCents = (n) => Math.max(0, Math.round(Number(n || 0) * 100));

export default function OrderSummaryCard({
  items: passedItems,
  orderId,
  title = "ORDER SUMMARY",
  className = "",
  subtotalOverride,
  discount = 0,
  shippingFee = 0,
  totalOverride,

  showAddress = false,
  shippingAddress = null,
  showSupport = true,
  order: orderFromParent = null,
}) {
  const [order, setOrder] = useState(orderFromParent === null ? undefined : orderFromParent);
  const [items, setItems] = useState([]);
  const [proofUrlResolved, setProofUrlResolved] = useState("");

  // allow parent override
  useEffect(() => {
    if (orderFromParent !== null) setOrder(orderFromParent);
  }, [orderFromParent]);

  // items passed directly
  useEffect(() => {
    (async () => {
      if (!passedItems) return;
      const withUrls = await Promise.all(
        passedItems.map(async (it) => ({
          ...it,
          imageResolved: await resolveStorageUrl(it.image || it.imageUrl || ""),
        }))
      );
      setItems(withUrls);
      if (!orderFromParent) setOrder({ items: withUrls });
    })();
  }, [passedItems, orderFromParent]);

  // fetch order if needed
  useEffect(() => {
    if (passedItems || orderFromParent) return;
    let stopAuth = () => {};

    async function fetchById(id) {
      const snap = await getDoc(doc(firestore, "orders", id));
      setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }
    async function fetchLatest(uid) {
      if (!uid) return setOrder(null);
      const qRef = query(collection(firestore, "orders"), where("userId", "==", uid));
      const snap = await getDocs(qRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

    return () => {
      try { stopAuth(); } catch {}
    };
  }, [orderId, passedItems, orderFromParent]);

  // resolve item images from order
  useEffect(() => {
    if (passedItems) return;
    (async () => {
      const src = order?.items || [];
      const withUrls = await Promise.all(
        src.map(async (it) => ({
          ...it,
          imageResolved: await resolveStorageUrl(it.image || it.imageUrl || it.photo || ""),
        }))
      );
      setItems(withUrls);
    })();
  }, [order, passedItems]);

  // resolve readable proof URL (or hide)
  useEffect(() => {
    (async () => {
      const raw =
        order?.paymentProofUrl ||
        order?.lastAdditionalPaymentProofUrl ||
        "";
      const resolved = await resolveStorageUrl(raw);
      setProofUrlResolved(resolved); // empty if not readable
    })();
  }, [order?.paymentProofUrl, order?.lastAdditionalPaymentProofUrl]);

  const subtotal = useMemo(() => {
    if (subtotalOverride != null) return Number(subtotalOverride);
    if (order?.subtotal != null && !passedItems) return Number(order.subtotal);
    const src = passedItems || order?.items || [];
    return src.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0);
  }, [order, passedItems, subtotalOverride]);

  const disc = Number(discount || order?.discount || 0);
  const ship = Number(shippingFee || order?.shippingFee || order?.shipping || 0);
  const total = useMemo(() => {
    if (totalOverride != null) return Number(totalOverride);
    if (order?.total != null && !passedItems) return Number(order.total);
    return Math.max(0, subtotal - disc + ship);
  }, [order, passedItems, subtotal, disc, ship, totalOverride]);

  const addr = useMemo(() => shippingAddress || order?.shippingAddress || null, [order, shippingAddress]);

  const rollups = useMemo(() => {
    const o = order || {};
    const isPending = String(o.paymentStatus || "").toLowerCase() === "pending";
    const assessedC = Number(o.assessedTotalCents ?? toCents(total));
    const depositC = isPending ? 0 : Number(o.depositCents ?? toCents(total));
    const addsC = Number(o.additionalPaymentsCents || 0);
    const refundsC = Number(o.refundsCents || 0);
    const netPaidC = Math.max(0, depositC + addsC - refundsC);
    const balanceC = Math.max(0, assessedC - netPaidC);
    return { assessedC, depositC, addsC, refundsC, netPaidC, balanceC };
  }, [order, total]);

  if (order === undefined) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img
            src={PLACEHOLDER}
            alt="Loading"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER; }}
          />
          <div className="cart-info">
            <p>Loading…</p>
            <span>Qty: —</span>
          </div>
          <span className="price">—</span>
        </div>
        <div className="summary-totals">
          <div><span>Subtotal</span><span>—</span></div>
          <div><span>Discount</span><span>—</span></div>
          <div><span>Shipping &amp; Handling</span><span>—</span></div>
        </div>
        <div className="summary-total">
          <strong>TOTAL</strong>
          <strong>—</strong>
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
  if (order === null && !passedItems) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img
            src={PLACEHOLDER}
            alt="No order"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER; }}
          />
          <div className="cart-info">
            <p>No order</p>
            <span>Qty: —</span>
          </div>
          <span className="price">—</span>
        </div>
      </div>
    );
  }

  const lineItems = items.length ? items : order.items || [];
  const count = lineItems.reduce((s, it) => s + Number(it.qty || 1), 0);

  return (
    <div className={`checkout-summary ${className}`}>
      <h3>{title}</h3>

      <div className="kv">
        <label>Status</label>
        <div>{String(order?.status || "processing").toUpperCase()}</div>
      </div>
      <div className="kv">
        <label>Payment</label>
        <div>{String(order?.paymentStatus || "pending").toUpperCase()}</div>
      </div>

      {/* Show payment proof ONLY if we resolved a readable URL */}
      {proofUrlResolved ? (
        <div style={{ marginTop: 6 }}>
          <img
            src={proofUrlResolved}
            alt="Payment Proof"
            style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER; }}
          />
        </div>
      ) : null}

      <div className="cart-header">🛒 Cart ({count})</div>

      {lineItems.map((it, i) => {
        const name = it.name || it.title || `Item #${i + 1}`;
        const qty = Number(it.qty || 1);
        const price = Number(it.price || 0);

        const src = safeImageSrc(it.imageResolved, it.image || it.imageUrl || it.photo);

        return (
          <div className="cart-item" key={(it.id || it.productId || i) + ""}>
            <img
              src={src}
              alt={name}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = PLACEHOLDER;
              }}
            />
            <div className="cart-info">
              <p>{name}</p>
              <span>Qty: {qty}</span>
              {(it?.colorName || it?.colorHex) && (
                <span>
                  Color: {it.colorName || "—"}
                  {it.colorHex ? ` (${it.colorHex})` : ""}
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
          <p>{[addr.line1, addr.line2, addr.city, addr.province, addr.zip].filter(Boolean).join(" ")}</p>
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

      <h4 style={{ marginTop: 12 }}>PAYMENT SUMMARY</h4>
      <div className="summary-totals">
        <div><span>Assessed Total</span><span>{peso(rollups.assessedC / 100)}</span></div>
        <div><span>Deposit</span><span>+ {peso(rollups.depositC / 100)}</span></div>
        <div><span>Additional Payments</span><span>+ {peso(rollups.addsC / 100)}</span></div>
        <div><span>Refunds</span><span>- {peso(rollups.refundsC / 100)}</span></div>
      </div>
      <div className="summary-total">
        <strong>Net Paid</strong>
        <strong>{peso(rollups.netPaidC / 100)}</strong>
      </div>
      <div className="summary-total">
        <strong>Balance Due</strong>
        <strong>{peso(rollups.balanceC / 100)}</strong>
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
