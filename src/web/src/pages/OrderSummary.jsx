// src/pages/OrderSummary.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import "../OrderSummary.css";
import { auth, firestore, collection, query, where, getDocs, doc } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, orderBy, limit } from "firebase/firestore";

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
  if (["prepare","preparing","packaging","for packaging"].includes(x)) return "preparing";
  if (["to_ship","shipping","shipped","in_transit","ready_to_ship"].includes(x)) return "to_ship";
  if (["to_receive","out_for_delivery","delivered"].includes(x)) return "to_receive";
  if (["to_rate","completed","done"].includes(x)) return "to_rate";
  return "processing";
};

const messages = {
  processing: "Your order has been approved and is now in production. This step usually takes 2–4 days. We'll keep you updated.",
  preparing: "We’re preparing and packaging your order. We’ll notify you once it’s ready to ship.",
  to_ship: "Your package is queued for pickup. You’ll receive tracking details after dispatch.",
  to_receive: "Your package is on the way. Expect delivery soon—watch for courier updates.",
  to_rate: "Order received! We’d love your feedback—rate your experience when you’re ready.",
};

export default function OrderSummary() {
  const { orderId: orderIdParam } = useParams();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qsOrderId = qs.get("orderId");
  const customId = qs.get("customId");
  const orderId = orderIdParam || qsOrderId || null;

  const [uid, setUid] = useState(null);
  const [order, setOrder] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  useEffect(() => {
    if (!orderId || customId) return;
    const ref = doc(firestore, "orders", orderId);
    const stop = onSnapshot(ref, (snap) => setOrder(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null), () => setOrder(null));
    return stop;
  }, [orderId, customId]);

  useEffect(() => {
    if (orderId || customId || !uid) return;
    const qRef = query(collection(firestore, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(1));
    const stop = onSnapshot(qRef, (snap) => {
      const d = snap.docs[0];
      setOrder(d ? { id: d.id, ...d.data() } : null);
    }, () => setOrder(null));
    return stop;
  }, [uid, orderId, customId]);

  const currentKey = normalizeStatus(order?.status);
  const currentIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentKey));
  const note = messages[currentKey];

  const money = useMemo(() => {
    if (!order) return { assessedC:0, depositC:0, addsC:0, refundsC:0, requestedC:0, balanceC:0 };
    const N = (x)=> Math.max(0, Math.round(Number(x || 0)));
    const assessedC = N(order.assessedTotalCents);
    const depositC  = N(order.depositCents);
    const addsC     = N(order.additionalPaymentsCents);
    const refundsC  = N(order.refundsCents);
    const requestedC= N(order.requestedAdditionalPaymentCents);
    const netPaidC  = Math.max(0, depositC + addsC - refundsC);
    const balanceC  = assessedC>0 ? Math.max(0, assessedC - netPaidC) : 0;
    return { assessedC, depositC, addsC, refundsC, requestedC, balanceC };
  }, [order]);

  return (
    <div className="os-page">
      <div className="os-left">
        {order === undefined ? (
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
              orderId={order?.id || orderId || customId}
              showAddress
              showSupport={false}
              order={order}
            />

            {/* Pay button logic: priority to requested additional; else assessed balance */}
            {order?.id && money.requestedC > 0 ? (
              <div style={{ marginTop: 12 }}>
                <a className="save-btn" href={`/payment?orderId=${order.id}`} style={{ display: "inline-block" }}>
                  Pay ₱{(money.requestedC/100).toLocaleString()} (additional)
                </a>
              </div>
            ) : money.balanceC > 0 && money.assessedC > 0 ? (
              <div style={{ marginTop: 12 }}>
                <a className="save-btn" href={`/payment?orderId=${order.id}`} style={{ display: "inline-block" }}>
                  Pay remaining ₱{(money.balanceC/100).toLocaleString()}
                </a>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="os-right">
        <div className="os-card os-status">
          <h4>ORDER DETAILS</h4>
          <div className="os-steps-bar" style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", background: "#fff" }}>
            <div className="os-stepper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
              {STEPS.map((s, i) => {
                const done = order !== undefined && i <= currentIdx;
                return (
                  <div key={s.key} className={`os-step${done ? " done" : ""}`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", minWidth: 90 }}>
                    <div className="os-step-icon" aria-hidden="true"
                      style={{ width: 36, height: 36, lineHeight: "36px", borderRadius: "50%", border: done ? "3px solid #2e7d32" : "3px solid #d1d5db", fontSize: 18, userSelect: "none" }}>
                      {s.icon}
                    </div>
                    <div className="os-step-label" style={{ marginTop: 6 }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="os-note" style={{ minHeight: 56, marginTop: 12 }}>{order === undefined ? (
            <span className="line skeleton" style={{ display: "block", height: 14, width: "70%", background: "#eee" }} />
          ) : note}</p>
        </div>

        <div className="os-card os-help">
          <h4>NEED ASSISTANCE?</h4>
          <ul>
            <li>💬 Live Chat: Offline now</li>
            <li>📞 Call: 123-123-312</li>
            <li>✉️ Email Us: Furnitune@jemeyl.com</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
