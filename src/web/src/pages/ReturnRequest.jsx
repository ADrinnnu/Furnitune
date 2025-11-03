// src/pages/ReturnRequest.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ---------- utils ---------- */
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function fmtDate(msOrTs) {
  const ms = typeof msOrTs === "number" ? msOrTs : tsToMillis(msOrTs);
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(); } catch { return "—"; }
}
function fmtPHP(n) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(Number(n) || 0);
  } catch {
    return `₱${(Number(n) || 0).toFixed(2)}`;
  }
}
function getOriginKey(o) {
  if (o?.repairId) return "REPAIR";
  if (
    o?.origin === "customization" ||
    o?.orderType === "customization" ||
    o?.customizationId ||
    o?.customId ||
    (Array.isArray(o?.items) &&
      o.items.some(
        (it) =>
          it?.meta?.source === "customization" ||
          it?.meta?.custom === true ||
          it?.meta?.customization === true
      ))
  ) {
    return "CUSTOMIZATION";
  }
  return "CATALOG";
}
function computedDeadline(o) {
  const delivered = tsToMillis(o?.deliveredAt);
  if (!delivered) return 0;
  const days = Number(o?.returnPolicyDays ?? 7);
  return delivered + days * 24 * 60 * 60 * 1000;
}
function canReturn(order) {
  if (!order) return false;
  if (getOriginKey(order) !== "CATALOG") return false;
  const explicit = tsToMillis(order?.returnDeadlineAt);
  const deadline = explicit || computedDeadline(order);
  if (!deadline) return false;
  return Date.now() <= deadline;
}
function daysLeft(order) {
  const explicit = tsToMillis(order?.returnDeadlineAt);
  const deadline = explicit || computedDeadline(order);
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));
}

/* ---------- constants ---------- */
const REASONS = [
  { value: "damaged", label: "Item arrived damaged" },
  { value: "wrong_item", label: "Received wrong item/variant" },
  { value: "missing_parts", label: "Missing parts/accessories" },
  { value: "not_as_described", label: "Not as described" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
];

const REFUND_METHODS = [
  { value: "original", label: "Refund to original payment method" },
  { value: "exchange", label: "Exchange" },
];

export default function ReturnRequest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("orderId");

  const db = useMemo(() => getFirestore(auth.app), []);
  const storage = useMemo(() => getStorage(auth.app), []);

  const [order, setOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [err, setErr] = useState("");
  

  const items = Array.isArray(order?.items) ? order.items : [];
  const [qtyMap, setQtyMap] = useState({});
  const [reason, setReason] = useState(REASONS[0].value);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHODS[0].value);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const eligible = canReturn(order);
  const daysRemaining = daysLeft(order);
  const originKey = getOriginKey(order || {});

  useEffect(() => {
    let active = true;
    async function load() {
      setErr("");
      setLoadingOrder(true);
      try {
        if (!orderId) { setErr("Missing orderId."); setLoadingOrder(false); return; }
        const snap = await getDoc(doc(db, "orders", orderId));
        if (!active) return;
        if (!snap.exists()) {
          setErr("Order not found.");
          setOrder(null);
        } else {
          const o = { id: snap.id, ...snap.data() };
          setOrder(o);
          const init = {};
          (Array.isArray(o.items) ? o.items : []).forEach((_it, idx) => { init[idx] = 0; });
          setQtyMap(init);
        }
      } catch (e) {
        console.error(e);
        setErr(e?.message || "Failed to load order.");
        setOrder(null);
      } finally {
        if (active) setLoadingOrder(false);
      }
    }
    load();
    return () => { active = false; };
  }, [db, orderId]);

  function sumSelected() {
    return Object.values(qtyMap || {}).reduce((s, n) => s + (Number(n) || 0), 0);
  }

  function onQtyChange(idx, max, raw) {
    let v = parseInt(raw, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > max) v = max;
    setQtyMap((p) => ({ ...p, [idx]: v }));
  }

  async function submit() {
  if (!orderId) { alert("Missing order."); return; }
  const uid = auth.currentUser?.uid;
  if (!uid) { alert("Please sign in."); return; }
  if (!order) { alert("Order not loaded."); return; }

  if (!eligible) {
    alert(
      originKey !== "CATALOG"
        ? "This order type is not eligible for returns."
        : "Return window has ended."
    );
    return;
  }

  setSubmitting(true);
  try {
    // optional photo (first file only)
    let imageUrl = null;
    if (file) {
      const p = `returns/${uid}/${orderId}/${Date.now()}_${file.name}`;
      const r = ref(storage, p);
      await uploadBytes(r, file);
      imageUrl = await getDownloadURL(r);
    }

    // create the return request (this is allowed by your rules)
    await addDoc(collection(db, "returns"), {
      userId: uid,
      orderId,
      message: desc.trim(),
      imageUrl,
      status: "requested",
      createdAt: serverTimestamp(),
    });

    // try to flip order to "refund" (ok if rules deny it)
    try {
  await updateDoc(doc(db, "orders", orderId), { status: "refund" });

} catch (e) {
  // Only warn if it's NOT a permission issue; otherwise ignore silently.
  const code = e?.code || "";
  const msg  = e?.message || "";
  if (code !== "permission-denied" && !/insufficient permissions|permission/i.test(msg)) {
    console.warn("Order status update skipped (non-permission error):", e);
  }
  // else do nothing – request is created and admin/CF will move the status
}


    alert("Return/Refund request sent. We’ll review and update your order status shortly.");
    navigate(`/ordersummary?orderId=${orderId}`, { replace: true });
  } catch (e) {
    console.error(e);
    alert("Failed to submit request.");
  } finally {
    setSubmitting(false);
  }





    const totalSelected = sumSelected();
    if (totalSelected <= 0) {
      alert("Please select at least one item/quantity to return.");
      return;
    }

    setSubmitting(true);
    setErr("");

    try {
      // prevent duplicate open requests
      const qy = query(collection(db, "return_requests"), where("orderId", "==", orderId));
      const snap = await getDocs(qy);
      const openStatuses = new Set(["requested","approved","awaiting_pickup","in_transit","received_pending_check"]);
      const alreadyOpen = snap.docs.some(d => openStatuses.has(String(d.data()?.status || "requested")));
      if (alreadyOpen) {
        alert("You already have a return in progress for this order.");
        setSubmitting(false);
        return;
      }

      // upload images
      let imageUrls = [];
      if (files && files.length > 0) {
        imageUrls = await Promise.all(
          Array.from(files).slice(0, 6).map(async (f) => {
            const p = `return_requests/${uid}/${orderId}/${Date.now()}_${f.name}`;
            const r = ref(storage, p);
            await uploadBytes(r, f);
            return await getDownloadURL(r);
          })
        );
      }

      // selected items
      const selectedItems = items
        .map((it, idx) => {
          const qty = Number(qtyMap[idx] || 0);
          if (qty <= 0) return null;
          return {
            productId: it.productId || it.id || null,
            title: it.title || it.name || "Item",
            unitPrice: Number(it.price || 0),
            qty,
            maxQty: Number(it.qty || 1),
            variant: it.size || it.variant || it.color || null,
          };
        })
        .filter(Boolean);

      const refDoc = await addDoc(collection(db, "return_requests"), {
        userId: uid,
        orderId,
        reasonCode: reason,
        refundMethod,
        message: String(desc || "").trim(),
        images: imageUrls,
        items: selectedItems,
        status: "requested",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: "user",
        origin: originKey,
        contactEmail: order?.contactEmail || order?.shippingAddress?.email || null,
      });

      await updateDoc(doc(db, "orders", orderId), {
        hasOpenReturn: true,
        lastReturnRequestId: refDoc.id,
        lastReturnRequestedAt: serverTimestamp(),
      });

      alert("Return/Refund request submitted.");
      navigate(`/ordersummary?orderId=${orderId}`, { replace: true });
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to submit return request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payment-container">
      {/* LEFT: form */}
      <div className="payment-form">
        <h3>RETURN / REFUND</h3>
        <hr />
        {loadingOrder && <p className="muted">Loading order…</p>}
        {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}

        {order && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              <div><strong>Order:</strong> <code>{order.id}</code></div>
              <div><strong>Placed:</strong> {fmtDate(order.createdAt)}</div>
              <div>
                <strong>Return window:</strong>{" "}
                {order.returnDeadlineAt
                  ? fmtDate(order.returnDeadlineAt)
                  : (computedDeadline(order) ? fmtDate(computedDeadline(order)) : "—")}
                {eligible ? ` (${daysRemaining} day${daysRemaining===1?"":"s"} left)` : (order.returnDeadlineAt || computedDeadline(order) ? " (ended)" : "")}
              </div>
              <div><strong>Type:</strong> {getOriginKey(order)}</div>
            </div>

            {getOriginKey(order) !== "CATALOG" && (
              <div className="err" style={{ marginBottom: 12 }}>
                This order type isn’t eligible for returns under current policy.
              </div>
            )}
            {!eligible && getOriginKey(order) === "CATALOG" && (
              <div className="err" style={{ marginBottom: 12 }}>
                The return window for this order has ended.
              </div>
            )}

            <h4>Items to return</h4>
            {items.length === 0 && <p className="muted">No items on this order.</p>}
            {items.length > 0 && (
              <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                {items.map((it, idx) => {
                  const max = Number(it?.qty || 1);
                  const qty = Number(qtyMap[idx] || 0);
                  const img = it?.image || it?.img || "/placeholder.jpg";
                  return (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderTop: idx ? "1px dashed #f1f5f9" : "none" }}>
                      <img src={img} alt={it?.title || it?.name || "Item"} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} onError={(e)=>{ e.currentTarget.src="/placeholder.jpg"; }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{it?.title || it?.name || "Item"}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {it?.size || it?.variant || it?.color ? `${it.size || it.variant || it.color} • ` : ""}Qty ordered: {max} • Unit: {fmtPHP(it?.price)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ fontSize: 12 }}>Return qty</label>
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={qty}
                          onChange={(e) => onQtyChange(idx, max, e.target.value)}
                          style={{ width: 72, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 6 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 12 }}>
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                >
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Refund method
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                >
                  {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>

            <label style={{ marginTop: 12, fontSize: 12 }}>Upload Photos (optional, up to 6)</label>
            <input
        type="file"
  accept="image/*"
  multiple   
  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
/>


            <label style={{ marginTop: 12, fontSize: 12 }}>Message / Description (optional)</label>
            <textarea
              rows={6}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Tell us what went wrong…"
              style={{ width: "100%" }}
            />

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button className="back-btn" onClick={() => navigate(-1)} disabled={submitting}>
                GO BACK
              </button>
              <button
                className="order-btn"
                onClick={submit}
                disabled={submitting || !eligible || sumSelected() <= 0}
                title={!eligible ? "Not eligible for return" : (sumSelected() <= 0 ? "Select at least one item" : "")}
              >
                {submitting ? "SUBMITTING…" : "SUBMIT"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: summary/help */}
      <div className="order-summary">
        <h3>RETURN POLICY</h3>
        <div className="order-card" style={{ padding: 16, fontSize: 14 }}>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>Return window is based on <strong>Delivered</strong> date.</li>
            <li>Customized and repair orders are not eligible.</li>
            <li>You may request partial returns by item/quantity.</li>
            <li>We’ll review and update you via notifications and email.</li>
          </ul>
          {(order?.returnDeadlineAt || computedDeadline(order || {})) && (
            <p style={{ marginTop: 12 }} className="muted">
              Deadline:{" "}
              <strong>
                {fmtDate(order?.returnDeadlineAt || computedDeadline(order))}
              </strong>
              {eligible ? ` — ${daysRemaining} day${daysRemaining===1?"":"s"} left` : " — ended"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
