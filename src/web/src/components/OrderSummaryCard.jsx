// src/components/OrderSummaryCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  auth,
  firestore,
  storage,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  ref,
  getDownloadURL,
} from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, limit } from "firebase/firestore";
import "../OrderSummary.css";

/* ---------- lightweight placeholder ---------- */
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
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
    return val; // plain http(s)
  } catch {
    return "";
  }
}
async function resolveMany(urls) {
  const uniq = [...new Set((urls || []).filter(Boolean))];
  return Promise.all(uniq.map(resolveStorageUrl));
}
function safeImageSrc(primaryResolvedUrl, original) {
  if (primaryResolvedUrl) return primaryResolvedUrl;
  if (isStorageLikeUrl(original)) return PLACEHOLDER;
  return original || PLACEHOLDER;
}
const peso = (v) => `₱${Number(v || 0).toLocaleString("en-PH")}`;
const toCents = (n) => Math.max(0, Math.round(Number(n || 0) * 100));

/* 🔹 unified way to pick an item image (also checks nested product.*) */
function getItemImageCandidate(it = {}) {
  return (
    it.image ||
    it.imageUrl ||
    it.photo ||
    (it.product && (it.product.imageUrl || it.product.image)) ||
    ""
  );
}

/* 🔹 NEW: order-level image candidate (handles mobile shape with root "product") */
function getOrderImageCandidate(order = {}) {
  return (
    order.imageUrl ||
    (order.product && (order.product.imageUrl || order.product.image)) ||
    ""
  );
}

/* ---------- status helpers (keep in sync with OrderSummary.jsx) ---------- */
const STATUS_RANK = {
  processing: 1,
  preparing: 2,
  to_ship: 3,
  to_receive: 4,
  to_rate: 5,
};

function normalizeStatusKey(s) {
  const x = String(s || "").toLowerCase();
  if (["processing", "pending"].includes(x) || !x) return "processing";
  if (["prepare", "preparing", "packaging", "for packaging"].includes(x)) return "preparing";
  if (["to_ship", "shipping", "shipped", "in_transit", "ready_to_ship"].includes(x))
    return "to_ship";
  if (["to_receive", "out_for_delivery", "delivered"].includes(x)) return "to_receive";
  if (["to_rate", "completed", "done"].includes(x)) return "to_rate";
  return "processing";
}

function pickBestStatusKey(candidates) {
  let best = "processing";
  let bestScore = -1;
  for (const raw of candidates) {
    if (!raw) continue;
    const key = normalizeStatusKey(raw);
    const score = STATUS_RANK[key] ?? 0;
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

/* ---------- which fields to merge from linked docs ---------- */
const MERGE_FIELDS = [
  "assessedTotalCents",
  "depositCents",
  "additionalPaymentsCents",
  "refundsCents",
  "requestedAdditionalPaymentCents",
  "paymentStatus",
  "paymentProofUrl",
  "paymentProofPath",
  "lastAdditionalPaymentProofUrl",
  "lastAdditionalPaymentProofPath",
  "additionalPaymentProofs",
  "depositPaymentProofUrl",
  "depositPaymentProofs",
];

export default function OrderSummaryCard({
  items: passedItems,
  orderId,
  title = "ORDER SUMMARY",
  className = "",
  subtotalOverride,
  shippingFee = null,
  totalOverride,

  showAddress = false,
  shippingAddress = null,
  showSupport = true,
  order: orderFromParent = null,
}) {
  const [order, setOrder] = useState(orderFromParent === null ? undefined : orderFromParent);
  const [linkedCustom, setLinkedCustom] = useState(null);
  const [linkedRepair, setLinkedRepair] = useState(null);

  const [items, setItems] = useState([]);

  // proofs
  const [depositProofUrls, setDepositProofUrls] = useState([]);
  const [additionalProofUrls, setAdditionalProofUrls] = useState([]);

  /* ---------- allow parent override ---------- */
  useEffect(() => {
    if (orderFromParent !== null) setOrder(orderFromParent);
  }, [orderFromParent]);

  /* ---------- items passed directly ---------- */
  useEffect(() => {
    (async () => {
      if (!passedItems) return;

      const parentOrder = orderFromParent || {}; // 🔹 may hold product.imageUrl from mobile
      const orderImg = getOrderImageCandidate(parentOrder);

      const withUrls = await Promise.all(
        passedItems.map(async (it) => {
          const rawImg = getItemImageCandidate(it) || orderImg; // 🔹 fallback to order-level image
          return {
            ...it,
            imageResolved: await resolveStorageUrl(rawImg),
          };
        })
      );
      setItems(withUrls);
      if (!orderFromParent) setOrder({ items: withUrls });
    })();
  }, [passedItems, orderFromParent]);

  /* ---------- fetch order if needed ---------- */
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
      try {
        stopAuth();
      } catch {}
    };
  }, [orderId, passedItems, orderFromParent]);

  /* ---------- subscribe to linked customization (if any) ---------- */
  useEffect(() => {
    if (!order) {
      setLinkedCustom(null);
      return;
    }

    const origin = String(order?.origin || "");
    const hasCustomLink =
      origin === "customization" ||
      order?.customId ||
      order?.linkedCustomId ||
      order?.metadata?.customId;

    if (!hasCustomLink) {
      setLinkedCustom(null);
      return;
    }

    const customDocId =
      order?.customId || order?.linkedCustomId || order?.metadata?.customId || null;

    if (customDocId) {
      const refDoc = doc(firestore, "custom_orders", customDocId);
      const stop = onSnapshot(
        refDoc,
        (snap) => setLinkedCustom(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        () => setLinkedCustom(null)
      );
      return stop;
    }

    // reverse lookup by orderId
    const qRef = query(
      collection(firestore, "custom_orders"),
      where("orderId", "==", order.id),
      limit(1)
    );
    const stop = onSnapshot(
      qRef,
      (snap) => {
        const d = snap.docs[0];
        setLinkedCustom(d ? { id: d.id, ...d.data() } : null);
      },
      () => setLinkedCustom(null)
    );
    return stop;
  }, [order]);

  /* ---------- subscribe to linked repair (if any) ---------- */
  useEffect(() => {
    if (!order) {
      setLinkedRepair(null);
      return;
    }

    const origin = String(order?.origin || "");
    const hasRepairLink =
      origin === "repair" || order?.repairId || order?.metadata?.repairId;

    if (!hasRepairLink) {
      setLinkedRepair(null);
      return;
    }

    const repairDocId = order?.repairId || order?.metadata?.repairId || null;

    if (repairDocId) {
      const refDoc = doc(firestore, "repairs", repairDocId);
      const stop = onSnapshot(
        refDoc,
        (snap) => setLinkedRepair(snap.exists() ? { id: snap.id, ...snap.data() } : null),
        () => setLinkedRepair(null)
      );
      return stop;
    }

    // reverse lookup by orderId
    const qRef = query(
      collection(firestore, "repairs"),
      where("orderId", "==", order.id),
      limit(1)
    );
    const stop = onSnapshot(
      qRef,
      (snap) => {
        const d = snap.docs[0];
        setLinkedRepair(d ? { id: d.id, ...d.data() } : null);
      },
      () => setLinkedRepair(null)
    );
    return stop;
  }, [order]);

  /* ---------- resolve item images from order (handles custom_orders shape) ---------- */
  useEffect(() => {
    if (passedItems) return;
    (async () => {
      if (!order) return;

      const orderImg = getOrderImageCandidate(order); // 🔹 from root order/product

      // start with normal items[]
      let src = Array.isArray(order.items) ? order.items : [];

      // if no items (like mobile custom_orders), synthesize one from the doc
      if (!src.length) {
        const img =
          (Array.isArray(order.images) && order.images[0]) ||
          (Array.isArray(order.referenceImages) && order.referenceImages[0]) ||
          "";

        const title =
          order.productTitle ||
          order.title ||
          "Repair Order";

        const price =
          order.unitPrice ??
          order?.priceBreakdown?.basePHP ??
          order?.priceBreakdown?.totalPHP ??
          0;

        src = [
          {
            id: order.productId || order.id || "custom",
            productId: order.productId || null,
            name: title,
            title,
            qty: 1,
            price,
            image: img,
          },
        ];
      }

      const withUrls = await Promise.all(
        src.map(async (it) => {
          const rawImg = getItemImageCandidate(it) || orderImg; // 🔹 item → order fallback
          return {
            ...it,
            imageResolved: await resolveStorageUrl(rawImg),
          };
        })
      );
      setItems(withUrls);
    })();
  }, [order, passedItems]);

  /* ---------- merge order + linked docs for display ---------- */
  const NUMERIC_FIELDS = new Set([
    "assessedTotalCents",
    "depositCents",
    "additionalPaymentsCents",
    "refundsCents",
    "requestedAdditionalPaymentCents",
  ]);
  function isEmptyVal(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "";
    return false;
  }

  const merged = useMemo(() => {
    if (!order) return order; // pass through undefined/null

    // order first, then custom, then repair
    const chain = [order, linkedCustom, linkedRepair].filter(Boolean);
    const out = { ...order };

    for (const k of MERGE_FIELDS) {
      const base = out[k];

      // allow overlays to override when base is unset OR zero (for numeric)
      const baseUnset = NUMERIC_FIELDS.has(k)
        ? base == null || Number(base) === 0
        : isEmptyVal(base);

      if (!baseUnset) continue;

      for (const src of chain.slice(1)) {
        const v = src?.[k];
        if (v == null) continue;

        if (NUMERIC_FIELDS.has(k)) {
          if (base == null || Number(v) > 0) {
            out[k] = v;
            break;
          }
        } else {
          if (!isEmptyVal(v)) {
            out[k] = v;
            break;
          }
        }
      }
    }

    return out;
  }, [order, linkedCustom, linkedRepair]);

  /* ---------- resolve proof images (deposit + additional) ---------- */
  useEffect(() => {
    (async () => {
      const m = merged || {};

      const depositSingles = [
        m.depositPaymentProofUrl,
        m.paymentProofUrl,
        m.paymentProofPath,
      ].filter(Boolean);
      const depositList = Array.isArray(m.depositPaymentProofs)
        ? m.depositPaymentProofs.map((p) => p?.url || p).filter(Boolean)
        : [];

      const addSingles = [
        m.lastAdditionalPaymentProofUrl,
        m.lastAdditionalPaymentProofPath,
      ].filter(Boolean);
      const addList = Array.isArray(m.additionalPaymentProofs)
        ? m.additionalPaymentProofs.map((p) => p?.url || p).filter(Boolean)
        : [];

      // 👉 If we have an array, treat it as source of truth; otherwise use singles
      const depositSources = depositList.length > 0 ? depositList : depositSingles;
      const additionalSources = addList.length > 0 ? addList : addSingles;

      setDepositProofUrls(await resolveMany(depositSources));
      setAdditionalProofUrls(await resolveMany(additionalSources));
    })();
  }, [merged]);

  /* ---------- money sections (now aware of priceBreakdown for customs) ---------- */
  const subtotal = useMemo(() => {
    if (subtotalOverride != null) return Number(subtotalOverride);
    if (merged?.subtotal != null && !passedItems) return Number(merged.subtotal);

    const src = passedItems || merged?.items || [];
    if (src.length > 0) {
      return src.reduce(
        (s, it) => s + Number(it.price || 0) * Number(it.qty || 1),
        0
      );
    }

    // mobile custom_orders / custom_orders fallback
    const pb = merged?.priceBreakdown;
    if (pb?.basePHP != null) return Number(pb.basePHP);
    if (merged?.unitPrice != null) return Number(merged.unitPrice);

    // 🔁 REPAIR fallback: use total/assessed/intended
    if (merged?.origin === "repair") {
      if (typeof merged.total === "number") return Number(merged.total);
      if (
        typeof merged.assessedTotalCents === "number" &&
        merged.assessedTotalCents > 0
      ) {
        return merged.assessedTotalCents / 100;
      }
      if (
        typeof merged.depositIntendedCents === "number" &&
        merged.depositIntendedCents > 0
      ) {
        return merged.depositIntendedCents / 100;
      }
    }

    return 0;
  }, [merged, passedItems, subtotalOverride]);

  const ship = useMemo(() => {
    if (shippingFee != null) return Number(shippingFee);
    if (merged?.shippingFee != null) return Number(merged.shippingFee);
    if (merged?.shipping != null) return Number(merged.shipping);

    // derive from priceBreakdown if available
    const pb = merged?.priceBreakdown;
    if (pb?.totalPHP != null && pb?.basePHP != null) {
      return Number(pb.totalPHP) - Number(pb.basePHP);
    }
    return 0;
  }, [merged, shippingFee]);

  const total = useMemo(() => {
    if (totalOverride != null) return Number(totalOverride);
    if (merged?.total != null && !passedItems) return Number(merged.total);

    const pb = merged?.priceBreakdown;
    if (pb?.totalPHP != null && !passedItems) return Number(pb.totalPHP);

    return Math.max(0, subtotal + ship);
  }, [merged, passedItems, subtotal, ship, totalOverride]);

  const addr = useMemo(
    () => shippingAddress || merged?.shippingAddress || null,
    [merged, shippingAddress]
  );

  const rollups = useMemo(() => {
    const o = merged || {};
    const status = String(o.paymentStatus || "").toLowerCase();

    const assessedC =
      o.assessedTotalCents != null ? Number(o.assessedTotalCents) : toCents(total);
    const depositC = o.depositCents != null ? Number(o.depositCents) : 0;
    const addsC = Number(o.additionalPaymentsCents || 0);
    const refundsC = Number(o.refundsCents || 0);
    const requestedC = Number(o.requestedAdditionalPaymentCents || 0);

    const netPaidC = Math.max(0, depositC + addsC - refundsC);

    // Default computed balance from assessed
    let balanceC = Math.max(0, assessedC - netPaidC);

    // If admin explicitly requested an additional amount, reflect that in Balance Due
    if (requestedC > 0 && (status === "awaiting_additional_payment" || balanceC === 0)) {
      balanceC = Math.max(balanceC, requestedC);
    }

    return { assessedC, depositC, addsC, refundsC, netPaidC, balanceC, status, requestedC };
  }, [merged, total]);

  /* ---------- skeletons ---------- */
  if (order === undefined && merged === undefined) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img
            src={PLACEHOLDER}
            alt="Loading"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
          />
          <div className="cart-info">
            <p>Loading…</p>
            <span>Qty: —</span>
          </div>
          <span className="price">—</span>
        </div>
        <div className="summary-totals">
          <div>
            <span>Subtotal</span>
            <span>—</span>
          </div>
          <div>
            <span>Shipping &amp; Handling</span>
            <span>—</span>
          </div>
        </div>
        <div className="summary-total">
          <strong>TOTAL</strong>
          <strong>—</strong>
        </div>

        {showSupport && (
          <div className="support-box">
            <h4>NEED ASSISTANCE?</h4>
            <p>💬 AI ChatBot: Online now</p>
            <p>📞 Call: 09650934957</p>
            <p>✉️ Email: furnitunecp@gmail.com</p>
          </div>
        )}
      </div>
    );
  }
  if ((order === null || merged === null) && !passedItems) {
    return (
      <div className={`checkout-summary ${className}`}>
        <h3>{title}</h3>
        <div className="cart-item">
          <img
            src={PLACEHOLDER}
            alt="No order"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
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

  const srcOrder = merged || order || {};
  const lineItems = items.length ? items : srcOrder.items || [];
  const count = lineItems.reduce((s, it) => s + Number(it.qty || 1), 0);

  // pick the furthest stage among order, custom, and repair
  const statusKey = pickBestStatusKey([
    linkedCustom?.status,
    linkedRepair?.status,
    srcOrder?.status,
  ]);
  const statusText = statusKey.toUpperCase();

  const paymentText = String(srcOrder?.paymentStatus || "pending").toUpperCase();

  const orderImg = getOrderImageCandidate(srcOrder); // 🔹 order-level image for render

  return (
    <div className={`checkout-summary ${className}`}>
      <h3>{title}</h3>

      {/* Status + Payment on single lines */}
      <div className="kv-row">
        <span className="kv-label">Order Status: </span>
        <span className="kv-value">{statusText}</span>
      </div>
      <div className="kv-row">
        <span className="kv-label">Payment Status: </span>
        <span className="kv-value">{paymentText}</span>
      </div>

      {/* Deposit proof(s) */}
      {depositProofUrls.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Deposit Payment Proof
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {depositProofUrls.map((u, i) => (
              <img
                key={i}
                src={u || PLACEHOLDER}
                alt={`Deposit Proof ${i + 1}`}
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = PLACEHOLDER;
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Additional proof(s) */}
      {additionalProofUrls.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Additional Payment Proofs
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {additionalProofUrls.map((u, i) => (
              <img
                key={i}
                src={u || PLACEHOLDER}
                alt={`Additional Proof ${i + 1}`}
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8 }}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = PLACEHOLDER;
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="cart-header">🛒 Cart ({count})</div>

      {lineItems.map((it, i) => {
        const name = it.name || it.title || `Item #${i + 1}`;
        const qty = Number(it.qty || 1);
        const price = Number(it.price || 0);

        const rawImg = getItemImageCandidate(it) || orderImg; // 🔹 item → order fallback
        const src = safeImageSrc(
          it.imageResolved,
          rawImg
        );

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
            {merged?.origin === "repair" ? null : (
              <span className="price">{peso(price)}</span>
            )}
          </div>
        );
      })}

      {showAddress && addr && (
        <div className="delivery-section">
          <h4>DELIVERY ADDRESS</h4>
          <p>
            <strong>Name: </strong>
            {addr.fullName ||
              [addr.firstName, addr.lastName].filter(Boolean).join(" ")}
          </p>
          {addr.phone && (
            <p>
              <strong>Phone: </strong>
              {addr.phone}
            </p>
          )}
          <p>
            <strong>Address: </strong>
            {[
              addr.line1,
              addr.line2,
              addr.city,
              addr.province,
              addr.zip,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      )}

      <div className="summary-totals">
        <div>
          <span>Subtotal</span>
          <span>{peso(subtotal)}</span>
        </div>
        <div>
          <span>Shipping &amp; Handling</span>
          <span>{peso(ship)}</span>
        </div>
      </div>
      <div className="summary-total">
        <strong>TOTAL</strong>
        <strong>{peso(total)}</strong>
      </div>

      <h4 style={{ marginTop: 12 }}>PAYMENT SUMMARY</h4>
      <div className="summary-totals">
        <div>
          <span>Assessed Total</span>
          <span>{peso(rollups.assessedC / 100)}</span>
        </div>
        <div>
          <span>Deposit</span>
          <span>+ {peso(rollups.depositC / 100)}</span>
        </div>
        <div>
          <span>Additional Payments</span>
          <span>+ {peso(rollups.addsC / 100)}</span>
        </div>
        <div>
          <span>Refunds</span>
          <span>- {peso(rollups.refundsC / 100)}</span>
        </div>
      </div>
      <div className="summary-total">
        <strong>Net Paid</strong>
        <strong>{peso(rollups.netPaidC / 100)}</strong>
      </div>
      <div className="summary-total">
        <strong>Balance Due</strong>
        <strong>{peso(rollups.balanceC / 100)}</strong>
      </div>
    </div>
  );
}
