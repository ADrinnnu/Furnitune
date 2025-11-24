import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import "../OrderSummary.css";
import { auth, firestore, collection, query, where, doc } from "../firebase";
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
  if (["prepare", "preparing", "packaging", "for packaging"].includes(x))
    return "preparing";
  if (["to_ship", "shipping", "shipped", "in_transit", "ready_to_ship"].includes(x))
    return "to_ship";
  if (["to_receive", "out_for_delivery", "delivered"].includes(x))
    return "to_receive";
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

/* -------------------- helpers -------------------- */
const N = (x) => Math.max(0, Math.round(Number(x || 0)));
const cents = (php) => Math.max(0, Math.round(Number(php || 0) * 100));

export default function OrderSummary() {
  const { orderId: orderIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qsOrderId = qs.get("orderId");
  const customId = qs.get("customId");
  const repairId = qs.get("repairId");
  const orderId = orderIdParam || qsOrderId || null;

  const [uid, setUid] = useState(null);
  const [order, setOrder] = useState(undefined); // main doc (orders/custom_orders/repairs)
  const [linkedCustom, setLinkedCustom] = useState(null); // extra overlay when base is orders
  const [linkedRepair, setLinkedRepair] = useState(null);

  /* ---------- auth ---------- */
  useEffect(
    () => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)),
    []
  );

  /* ---------- subscribe to primary doc ---------- */
  useEffect(() => {
    let stop = () => {};

    // 1) direct custom-only
    if (customId && !orderId && !repairId) {
      const ref = doc(firestore, "custom_orders", customId);
      stop = onSnapshot(
        ref,
        (snap) =>
          setOrder(
            snap.exists()
              ? { id: snap.id, ...snap.data(), origin: "customization" }
              : null
          ),
        () => setOrder(null)
      );
      return stop;
    }

    // 2) direct repair-only
    if (repairId && !orderId && !customId) {
      const ref = doc(firestore, "repairs", repairId);
      stop = onSnapshot(
        ref,
        (snap) =>
          setOrder(
            snap.exists()
              ? { id: snap.id, ...snap.data(), origin: "repair", repairId: snap.id }
              : null
          ),
        () => setOrder(null)
      );
      return stop;
    }

    // 3) standard orders collection
    if (!orderId || customId || repairId) return;

    const ref = doc(firestore, "orders", orderId);
    stop = onSnapshot(
      ref,
      (snap) =>
        setOrder(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setOrder(null)
    );
    return stop;
  }, [orderId, customId, repairId]);

  /* ---------- fallback: latest order by uid ---------- */
  useEffect(() => {
    if (orderId || customId || repairId || !uid) return;
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
  }, [uid, orderId, customId, repairId]);

  /* ---------- subscribe to linked customization (only when base is orders) ---------- */
  useEffect(() => {
    // if we navigated via ?customId=... then order already IS the custom doc
    if (!order || customId) {
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
      const ref = doc(firestore, "custom_orders", customDocId);
      const stop = onSnapshot(
        ref,
        (snap) =>
          setLinkedCustom(
            snap.exists() ? { id: snap.id, ...snap.data() } : null
          ),
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

  /* ---------- subscribe to linked repair (only when base is orders) ---------- */
  useEffect(() => {
    if (!order || repairId) {
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
      const ref = doc(firestore, "repairs", repairDocId);
      const stop = onSnapshot(
        ref,
        (snap) =>
          setLinkedRepair(
            snap.exists() ? { id: snap.id, ...snap.data() } : null
          ),
        () => setLinkedRepair(null)
      );
      return stop;
    }

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
  }, [order, repairId]);

  /* ---------- merged view: prefer order → custom → repair (for money/proofs only) ---------- */
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
      "paymentProofUrlPath",
      "depositPaymentProofUrl",
      "lastAdditionalPaymentProofUrl",
      "lastAdditionalPaymentProofPath",
      "additionalPaymentProofs",
      "depositPaymentProofs",
      "unitPrice",
      "shippingFee",
      "total",
    ];
    const out = { ...order };
    for (const k of keys) {
      if (out[k] != null) continue;
      for (const src of sourceChain.slice(1)) {
        if (src[k] != null) {
          out[k] = src[k];
          break;
        }
      }
    }
    return out;
  }, [order, linkedCustom, linkedRepair]);

  /* ---------- status + copy (pick furthest stage across order/custom/repair) ---------- */
  const currentKey = useMemo(() => {
    const rank = {
      processing: 1,
      preparing: 2,
      to_ship: 3,
      to_receive: 4,
      to_rate: 5,
    };

    let best = "processing";
    let bestScore = -1;

    const candidates = [
      linkedCustom?.status,
      linkedRepair?.status,
      (merged || order)?.status,
    ];

    for (const raw of candidates) {
      if (!raw) continue;
      const key = normalizeStatus(raw);
      const score = rank[key] ?? 0;
      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    }

    return best;
  }, [merged, order, linkedCustom, linkedRepair]);

  const currentIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentKey));
  const note = messages[currentKey];

  /* ---------- payment math (robust fallbacks) ---------- */
  const money = useMemo(() => {
    const src = merged || order || {};
    const assessedC =
      N(src.assessedTotalCents) ||
      cents(
        src.total != null
          ? Number(src.total)
          : Number(src.unitPrice || 0) + Number(src.shippingFee || 0)
      );

    const depositC = N(src.depositCents);
    const addsC = N(src.additionalPaymentsCents);
    const refundsC = N(src.refundsCents);
    const requestedC = N(src.requestedAdditionalPaymentCents);

    const netPaidC = Math.max(0, depositC + addsC - refundsC);
    const balanceC = assessedC > 0 ? Math.max(0, assessedC - netPaidC) : 0;

    return { assessedC, requestedC, balanceC };
  }, [order, merged]);

  const payStatus = String((merged || order)?.paymentStatus || "").toLowerCase();

  const showAdditionalBtn =
    payStatus !== "paid" &&
    payStatus !== "refunded" &&
    (payStatus === "awaiting_additional_payment" ||
      money.requestedC > 0 ||
      (money.assessedC > 0 && money.balanceC > 0));

  const amountToPayC =
    money.requestedC > 0 ? money.requestedC : money.balanceC;

  const isExplicitAdditional =
    payStatus === "awaiting_additional_payment" || money.requestedC > 0;

  /* ---------- render ---------- */
  return (
    <div className="os-page">
      <div className="os-left">
        {(merged ?? order) === undefined ? (
          <div
            className="os-card skeleton"
            role="status"
            aria-busy="true"
            style={{ padding: 20 }}
          >
            <div
              style={{
                height: 20,
                width: 220,
                background: "#eee",
                marginBottom: 12,
                borderRadius: 6,
              }}
            />
            <div
              style={{
                height: 12,
                width: 120,
                background: "#eee",
                marginBottom: 8,
                borderRadius: 6,
              }}
            />
            <div
              style={{
                height: 12,
                width: "100%",
                background: "#eee",
                margin: "12px 0",
                borderRadius: 6,
              }}
            />
            <div
              style={{
                height: 8,
                width: "60%",
                background: "#eee",
                marginTop: 6,
                borderRadius: 6,
              }}
            />
            <div
              style={{
                height: 8,
                width: "40%",
                background: "#eee",
                marginTop: 10,
                borderRadius: 6,
              }}
            />
          </div>
        ) : (
          <>
            <OrderSummaryCard
              title="ORDER SUMMARY"
              orderId={(merged || order)?.id || orderId || customId || repairId}
              showAddress
              showSupport={false}
              order={merged || order}
            />

            {showAdditionalBtn &&
              (merged || order)?.id &&
              amountToPayC > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="os-pay-btn"
                    onClick={() =>
                      navigate(
                        `/payment?orderId=${(merged || order).id}${
                          isExplicitAdditional ? "&mode=additional" : ""
                        }`
                      )
                    }
                  >
                    {isExplicitAdditional ? "Pay Additional" : "Pay Remaining"} ₱
                    {(amountToPayC / 100).toLocaleString()}
                  </button>
                </div>
              )}
          </>
        )}
      </div>

      <div className="os-right">
        <div className="os-card os-status">
          <h4>ORDER DETAILS</h4>
          <div
            className="os-steps-bar"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "12px 16px",
              background: "#fff",
            }}
          >
            <div
              className="os-stepper"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              {STEPS.map((s, i) => {
                const done =
                  (merged ?? order) !== undefined && i <= currentIdx;
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
                        border: done
                          ? "3px solid #2e7d32"
                          : "3px solid #d1d5db",
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
              <span
                className="line skeleton"
                style={{
                  display: "block",
                  height: 14,
                  width: "70%",
                  background: "#eee",
                }}
              />
            ) : (
              note
            )}
          </p>
        </div>

        {/* Help card – content-height, centered via CSS */}
        <div className="os-help">
          <div className="os-help-card">
            <h4>NEED ASSISTANCE?</h4>
            <ul>
              <li>💬 AI ChatBot: Online now</li>
              <li>📞 Call: 09650934957</li>
              <li>✉️ Email: furnitunecp@gmail.com</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
