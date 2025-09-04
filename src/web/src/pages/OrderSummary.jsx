// src/pages/OrderSummary.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import "../OrderSummary.css";

import { auth, firestore, collection, query, where, getDocs, doc, getDoc } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const STEPS = [
  { key: "processing", label: "PROCESSING ORDER", icon: "📄" },
  { key: "preparing",  label: "PREPARING",        icon: "🛠️" },
  { key: "to_ship",    label: "TO SHIP",          icon: "🚚" },
  { key: "to_receive", label: "TO RECEIVE",       icon: "📦" },
  { key: "to_rate",    label: "TO RATE",          icon: "⭐" },
];
const normalizeStatus = (s) => {
  const x = String(s || "").toLowerCase();
  if (["processing","pending"].includes(x) || !x) return "processing";
  if (["prepare","preparing","packaging","for packaging"].includes(x)) return "preparing";
  if (["to_ship","shipping","shipped","in_transit"].includes(x)) return "to_ship";
  if (["to_receive","out_for_delivery","delivered"].includes(x)) return "to_receive";
  if (["to_rate","completed","done"].includes(x)) return "to_rate";
  return "processing";
};
const messages = {
  processing: "Your order has been approved and is now in production. This step usually takes 2–4 days. We'll keep you updated.",
  preparing:  "We’re preparing and packaging your order. We’ll notify you once it’s ready to ship.",
  to_ship:    "Your package is queued for pickup. You’ll receive tracking details after dispatch.",
  to_receive: "Your package is on the way. Expect delivery soon—watch for courier updates.",
  to_rate:    "Order received! We’d love your feedback—rate your experience when you’re ready.",
};

export default function OrderSummary() {
  const { orderId: orderIdParam } = useParams();
  const [uid, setUid] = useState(null);
  const [order, setOrder] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid || null)), []);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (orderIdParam) {
        const snap = await getDoc(doc(firestore, "orders", orderIdParam));
        if (!alive) return;
        setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        return;
      }
      if (!uid) { setOrder(null); return; }
      const qRef = query(collection(firestore, "orders"), where("userId", "==", uid));
      const snap = await getDocs(qRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis?.() ? b.createdAt.toMillis() : 0;
        return tb - ta; // newest first
      });
      setOrder(list[0] || null);
    }
    run().catch(() => setOrder(null));
    return () => { alive = false; };
  }, [uid, orderIdParam]);

  const currentKey = normalizeStatus(order?.status);
  const currentIdx = Math.max(0, STEPS.findIndex(s => s.key === currentKey));
  const note = messages[currentKey];

  return (
    <div className="os-page">
      {/* LEFT: summary card with items + address, NO left support box */}
      <div className="os-left">
        <OrderSummaryCard
          title="ORDER SUMMARY"
          orderId={order?.id || orderIdParam}
          showAddress
          showSupport={false}   // << hide the left “Need Assistance?” here
        />
      </div>

      {/* RIGHT: details + tracker + right help box */}
      <div className="os-right">
        <div className="os-card">
          <h3 className="os-title">ORDER DETAILS</h3>

          <div className="os-tracker">
            {STEPS.map((s, i) => {
              const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "idle";
              return (
                <div key={s.key} className={`os-step ${state}`}>
                  <div className="os-step-icon" aria-hidden>{s.icon}</div>
                  <div className="os-step-label">{s.label}</div>
                </div>
              );
            })}
          </div>

          <p className="os-note">{note}</p>
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
