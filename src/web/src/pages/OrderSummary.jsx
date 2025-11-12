// src/pages/OrderSummary.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import "../OrderSummary.css";
import {
  auth,
  firestore,
  collection,
  query,
  where,
  doc,
} from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, orderBy, limit } from "firebase/firestore";

/* -------------------- Status steps -------------------- */
const STEPS = [
  { key: "processing", label: "PROCESSING ORDER", icon: "📄" },
  { key: "preparing", label: "PREPARING", icon: "🛠️" },
  { key: "to_ship", label: "TO SHIP", icon: "🚚" },
  { key: "to_receive", label: "TO RECEIVE", icon: "📦" },
  { key: "to_rate", label: "TO RATE", icon: "⭐" },
];

const normalizeStatus = (s) => {
  const x = String(s || "").toLowerCase();
  if (["processing", "pending"].includes(x) || !x) return "processing";
  if (["prepare", "preparing", "packaging", "for packaging"].includes(x)) return "preparing";
  if (["to_ship", "shipping", "shipped", "in_transit", "ready_to_ship"].includes(x)) return "to_ship";
  if (["to_receive", "out_for_delivery", "delivered"].includes(x)) return "to_receive";
  if (["to_rate", "completed", "done"].includes(x)) return "to_rate";
  return "processing";
};

const messages = {
  processing:
    "Your order has been approved and is now in production. This step usually takes 2–4 days. We'll keep you updated.",
  preparing:
    "We’re preparing and packaging your order. We’ll notify you once it’s ready to ship.",
  to_ship:
    "Your package is queued for pickup. You’ll receive tracking details after dispatch.",
  to_receive:
    "Your package is on the way. Expect delivery soon—watch for courier updates.",
  to_rate:
    "Order received! We’d love your feedback—rate your experience when you’re ready.",
};

/* -------------------- Component -------------------- */
export default function OrderSummary() {
  const { orderId: orderIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qsOrderId = qs.get("orderId");
  const customId = qs.get("customId"); // still supported if you deep-link a custom-only view
  const orderId = orderIdParam || qsOrderId || null;

  const [uid, setUid] = useState(null);
  const [order, setOrder] = useState(undefined);        // orders/{id}
  const [linkedCustom, setLinkedCustom] = useState(null); // custom_orders/{id}
  const [linkedRepair, setLinkedRepair] = useState(null); // repairs/{id}

  /* ---------- auth ---------- */
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  /* ---------- live subscribe to the order (by id or latest by uid) ---------- */
  useEffect(() => {
    if (!orderId || customId) return; // if viewing a pure custom page elsewhere
    const ref = doc(firestore, "orders", orderId);
    const stop = onSnapshot(
      ref,
      (snap) => setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setOrder(null)
    );
    return stop;
  }, [orderId, customId]);

  useEffect(() => {
    if (orderId || customId || !uid) return;
    const qRef = query(
      collection(firestore, "orders"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const stop = onSnapshot(
      qRef,
      (snap) => {
        const d = snap.docs[0];
        setOrder(d ? { id: d.id, ...d.data() } : null);
      },
      () => setOrder(null)
    );
    return stop;
  }, [uid, orderId, customId]);

  /* ---------- subscribe to linked customization (if any) ---------- */
  useEffect(() => {
    if (!order || customId) { setLinkedCustom(null); return; }
    const origin = String(order?.origin || "");
    const hasCustomLink =
      origin === "customization" ||
      order?.customId ||
      order?.linkedCustomId ||
      order?.metadata?.customId;

    if (!hasCustomLink) { setLinkedCustom(null); return; }

    const customDocId =
      order?.customId || order?.linkedCustomId || order?.metadata?.customId || null;

    if (customDocId) {
      const ref = doc(firestore, "custom_orders", customDocId);
      const stop = onSnapshot(
        ref,
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
  }, [order, customId]);

  /* ---------- subscribe to linked repair (if any) ---------- */
  useEffect(() => {
    if (!order) { setLinkedRepair(null); return; }
    const origin = String(order?.origin || "");
    const hasRepairLink =
      origin === "repair" ||
      order?.repairId ||
      order?.metadata?.repairId;

    if (!hasRepairLink) { setLinkedRepair(null); return; }

    const repairDocId = order?.repairId || order?.metadata?.repairId || null;

    if (repairDocId) {
      const ref = doc(firestore, "repairs", repairDocId);
      const stop = onSnapshot(
        ref,
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

  /* ---------- merged view: prefer order → custom → repair ---------- */
  const merged = useMemo(() => {
    if (!order) return order; // undefined/null passthrough
    const sourceChain = [order, linkedCustom, linkedRepair].filter(Boolean);
    const keys = [
      "assessedTotalCents",
      "depositCents",
      "additionalPaymentsCents",
      "refundsCents",
      "requestedAdditionalPaymentCents",
      "paymentStatus",
      "paymentProofUrl",
      "lastAdditionalPaymentProofUrl",
      "lastAdditionalPaymentProofPath",
      "additionalPaymentProofs",
    ];
    const out = { ...order };
    for (const k of keys) {
      if (out[k] != null) continue;
      for (const src of sourceChain.slice(1)) { // skip the first (order)
        if (src[k] != null) { out[k] = src[k]; break; }
      }
    }
    return out;
  }, [order, linkedCustom, linkedRepair]);

  /* ---------- status + copy ---------- */
  const currentKey = normalizeStatus((merged || order)?.status);
  const currentIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentKey));
  const note = messages[currentKey];

  /* ---------- payment summary ---------- */
  const money = useMemo(() => {
    const src = merged || order;
    if (!src) return { assessedC: 0, depositC: 0, addsC: 0, refundsC: 0, requestedC: 0, balanceC: 0 };
    const N = (x) => Math.max(0, Math.round(Number(x || 0)));
    const assessedC  = N(src.assessedTotalCents);
    const depositC   = N(src.depositCents);
    const addsC      = N(src.additionalPaymentsCents);
    const refundsC   = N(src.refundsCents);
    const requestedC = N(src.requestedAdditionalPaymentCents);
    const netPaidC   = Math.max(0, depositC + addsC - refundsC);
    const balanceC   = assessedC > 0 ? Math.max(0, assessedC - netPaidC) : 0;
    return { assessedC, depositC, addsC, refundsC, requestedC, balanceC };
  }, [order, merged]);

  /* Hide Pay button if paid/refunded */
  const payStatus = String((merged || order)?.paymentStatus || "").toLowerCase();
  const canPay =
    payStatus !== "paid" &&
    payStatus !== "refunded" &&
    (money.requestedC > 0 || (money.assessedC > 0 && money.balanceC > 0));

  /* ---------- render ---------- */
  return (
    <div className="os-page">
      <div className="os-left">
        {(merged ?? order) === undefined ? (
          <div className="os-card skeleton" role="status" aria-busy="true" style={{ padding: 20 }}>
            <div style={{ height: 20, width: 220, background: "#eee", marginBottom: 12, borderRadius: 6 }} />
            <div style={{ height: 12, width: 120, background: "#eee", marginBottom: 8, borderRadius: 6 }} />
            <div style={{ height: 12, width: "100%", background: "#eee", margin: "12px 0", borderRadius: 6 }} />
            <div style={{ height: 8, width: "60%", background: "#eee", marginTop: 6, borderRadius: 6 }} />
            <div style={{ height: 8, width: "40%", background: "#eee", marginTop: 10, borderRadius: 6 }} />
          </div>
        ) : (
          <>
            <OrderSummaryCard
              title="ORDER SUMMARY"
              orderId={(merged || order)?.id || orderId || customId}
              showAddress
              showSupport={false}
              order={merged || order}
            />

            {/* Pay button logic: priority to requested additional; else assessed balance.
                Hidden when paymentStatus is paid/refunded. */}

                {(merged || order) && (
  <div className="os-card" style={{ marginTop: 12 }}>
    <h4>PAYMENT SUMMARY</h4>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div><div className="muted small">Assessed Total</div><div className="mono strong">₱{((money.assessedC||0)/100).toLocaleString()}</div></div>
      <div><div className="muted small">Net Paid</div><div className="mono strong">₱{(((money.depositC||0)+(money.addsC||0)-(money.refundsC||0))/100).toLocaleString()}</div></div>
      <div><div className="muted small">Requested Additional</div><div className="mono">₱{((money.requestedC||0)/100).toLocaleString()}</div></div>
      <div><div className="muted small">Balance Due</div><div className="mono" style={{ fontWeight: 700, color: (money.balanceC>0 ? "#b91c1c" : "#1f2937") }}>₱{((money.balanceC||0)/100).toLocaleString()}</div></div>
    </div>
  </div>
)}
            {(merged || order)?.id && canPay && money.requestedC > 0 ? (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="os-pay-btn"
                  onClick={() => navigate(`/payment?orderId=${(merged || order).id}`)}
                >
                  Pay ₱{(money.requestedC / 100).toLocaleString()} (additional)
                </button>
              </div>
            ) : (merged || order)?.id && canPay && money.balanceC > 0 && money.assessedC > 0 ? (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="os-pay-btn"
                  onClick={() => navigate(`/payment?orderId=${(merged || order).id}`)}
                >
                  Pay remaining ₱{(money.balanceC / 100).toLocaleString()}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="os-right">
        <div className="os-card os-status">
          <h4>ORDER DETAILS</h4>
          <div
            className="os-steps-bar"
            style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", background: "#fff" }}
          >
            <div
              className="os-stepper"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}
            >
              {STEPS.map((s, i) => {
                const done = (merged ?? order) !== undefined && i <= currentIdx;
                return (
                  <div
                    key={s.key}
                    className={`os-step${done ? " done" : ""}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      minWidth: 90,
                    }}
                  >
                    <div
                      className="os-step-icon"
                      aria-hidden="true"
                      style={{
                        width: 36,
                        height: 36,
                        lineHeight: "36px",
                        borderRadius: "50%",
                        border: done ? "3px solid #2e7d32" : "3px solid #d1d5db",
                        fontSize: 18,
                        userSelect: "none",
                      }}
                    >
                      {s.icon}
                    </div>
                    <div className="os-step-label" style={{ marginTop: 6 }}>
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="os-note" style={{ minHeight: 56, marginTop: 12 }}>
            {(merged ?? order) === undefined ? (
              <span className="line skeleton" style={{ display: "block", height: 14, width: "70%", background: "#eee" }} />
            ) : (
              note
            )}
          </p>
        </div>

        <div className="os-card os-help">
          <h4>NEED ASSISTANCE?</h4>
          <ul>
            <li>💬 AI ChatBot: Online now</li>
            <li>📞 Call: 123-123-312</li>
            <li>✉️ Email Us: Furnitune@jemeyl.com</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
