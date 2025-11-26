// src/pages/ReturnRequest.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  setDoc,
  collection,
  serverTimestamp,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit
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

// Helper to identify the document type and ID from URL params
function resolveTarget(params) {
  const orderId = params.get("orderId");
  const repairId = params.get("repairId");
  const customId = params.get("customId");

  if (repairId) return { id: repairId, collection: "repairs", key: "REPAIR" };
  if (customId) return { id: customId, collection: "custom_orders", key: "CUSTOMIZATION" };
  if (orderId) return { id: orderId, collection: "orders", key: "CATALOG" };
  return null;
}

function getOriginKey(o, forcedKey) {
  if (forcedKey) return forcedKey;
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
  const days = Number(o?.returnPolicyDays ?? 3);  // default 3 days
  const msPerDay = 24 * 60 * 60 * 1000;

  // Prefer deliveredAt; if not yet delivered, fall back to createdAt (placed date)
  const delivered = tsToMillis(o?.deliveredAt);
  const placed = tsToMillis(o?.createdAt);

  const base = delivered || placed;
  if (!base) return 0;

  return base + days * msPerDay;
}

function canReturn(order) {
  if (!order) return false;
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

// GCash helpers
function onlyDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}
function is11DigitsLoose(s) {
  return onlyDigits(s).length === 11;
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

const REFUND_METHOD = { value: "original", label: "Refund to original payment method (GCash)" };

export default function ReturnRequest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  
  const target = useMemo(() => resolveTarget(params), [params]);

  const db = useMemo(() => getFirestore(auth.app), []);
  const storage = useMemo(() => getStorage(auth.app), []);

  const [order, setOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [err, setErr] = useState("");
  
  // New state to track if a request already exists
  const [existingRequest, setExistingRequest] = useState(null);

  const items = useMemo(() => {
    if (!order) return [];
    if (Array.isArray(order.items) && order.items.length > 0) return order.items;
    
    if (target?.key === "REPAIR") {
        return [{
            id: order.id,
            title: order.typeLabel || order.typeId || "Repair Service",
            price: order.total || 0,
            qty: 1,
            image: (order.images && order.images[0]) || null
        }];
    }
    if (target?.key === "CUSTOMIZATION") {
        return [{
            id: order.id,
            title: order.productTitle || order.title || "Custom Order",
            price: order.total || order.unitPrice || 0,
            qty: 1,
            image: (order.images && order.images[0]) || null
        }];
    }
    return [];
  }, [order, target]);

  const [qtyMap, setQtyMap] = useState({});
  const [reason, setReason] = useState(REASONS[0].value);
  const [desc, setDesc] = useState("");

  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");

  const eligible = canReturn(order);
  const daysRemaining = daysLeft(order);
  const originKey = getOriginKey(order || {}, target?.key);

  // Load Order Data + Check for Existing Request
  useEffect(() => {
    let active = true;
    async function load() {
      setErr("");
      setLoadingOrder(true);
      try {
        if (!target) { 
            setErr("Missing orderId, repairId, or customId."); 
            setLoadingOrder(false); 
            return; 
        }

        // 1. Load the Order/Repair/Custom Doc
        const snap = await getDoc(doc(db, target.collection, target.id));
        if (!active) return;
        
        if (!snap.exists()) {
          setErr("Order not found.");
          setOrder(null);
        } else {
          const o = { id: snap.id, ...snap.data() };
          setOrder(o);
          
          const loadedItems = Array.isArray(o.items) && o.items.length > 0 
            ? o.items 
            : (target.key === "REPAIR" || target.key === "CUSTOMIZATION" ? [1] : []);

          const init = {};
          loadedItems.forEach((_it, idx) => { init[idx] = 0; });
          setQtyMap(init);
        }

        // 2. Check if a return request ALREADY exists for this ID
        const reqQ = query(
            collection(db, "returns"), 
            where("orderId", "==", target.id),
            limit(1)
        );
        const reqSnap = await getDocs(reqQ);
        if (!reqSnap.empty) {
            const data = reqSnap.docs[0].data();
            setExistingRequest(data);
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
  }, [db, target]);

  function sumSelected() {
    return Object.values(qtyMap || {}).reduce((s, n) => s + (Number(n) || 0), 0);
  }

  function onQtyChange(idx, max, raw) {
    let v = parseInt(raw, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > max) v = max;
    setQtyMap((p) => ({ ...p, [idx]: v }));
  }

  async function submit(e) {
    e?.preventDefault?.();

    if (!target) { alert("Missing ID."); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { alert("Please sign in."); return; }
    if (!order) { alert("Order not loaded."); return; }

    // Strict check before submitting
    if (existingRequest) {
        alert("A return request already exists for this order.");
        return;
    }

    if (!eligible) {
      alert("Return window has ended.");
      return;
    }

    const totalSelected = sumSelected();
    if (totalSelected <= 0) {
      alert("Please select at least one item/quantity to return.");
      return;
    }

    const gcashDigits = onlyDigits(gcashNumber);
    if (gcashName.trim().length < 2 || gcashDigits.length !== 11) {
      alert("Enter a valid GCash Account Name and 11-digit Account Number.");
      return;
    }

    setSubmitting(true);
    setErr("");

    try {
      // Upload images
      let imageUrls = [];
      if (files && files.length > 0) {
        const slice = Array.from(files).slice(0, 6);
        imageUrls = await Promise.all(
          slice.map(async (f) => {
            const p = `returns/${uid}/${target.id}/${Date.now()}_${f.name}`;
            const r = ref(storage, p);
            await uploadBytes(r, f);
            return await getDownloadURL(r);
          })
        );
      }

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
            image: it?.image || it?.img || null,
          };
        })
        .filter(Boolean);

      const requestedAmount = selectedItems.reduce((s, it) => s + Number(it.unitPrice || 0) * Number(it.qty || 0), 0);
      const nowMs = Date.now();

      const payload = {
        userId: uid,
        orderId: target.id,
        status: "requested",
        origin: originKey,
        source: "user",
        createdAt: serverTimestamp(),
        createdAtMs: nowMs,
        updatedAt: serverTimestamp(),

        orderNumber: order?.orderNumber || order.id || null,
        paymentMethod: order?.paymentMethod || "GCASH",
        deliveredAt: order?.deliveredAt || null,

        contactEmail: order?.contactEmail || order?.shippingAddress?.email || null,
        contactPhone: order?.shippingAddress?.phone || order?.phone || null,

        reasonCode: reason,
        message: String(desc || "").trim(),
        images: imageUrls,
        items: selectedItems,
        requestedAmount,

        refundMethod: REFUND_METHOD.value,
        refundChannel: "GCASH",
        gcash: {
          accountName: gcashName.trim(),
          accountNumber: gcashDigits,
          last4: String(gcashDigits).slice(-4),
        },

        hasPhotos: imageUrls.length > 0,
        hasMessage: String(desc || "").trim().length > 0,
        totals: {
          itemCount: selectedItems.reduce((s, it) => s + Number(it.qty || 0), 0),
          lineCount: selectedItems.length,
        },
      };

      const masterRef = await addDoc(collection(db, "returns"), payload);

      await setDoc(doc(db, target.collection, target.id, "returns", masterRef.id), {
        id: masterRef.id,
        ...payload,
      });

      await updateDoc(doc(db, target.collection, target.id), {
        hasOpenReturn: true,
        lastReturnRequestId: masterRef.id,
        lastReturnRequestedAt: serverTimestamp(),
      }).catch(() => {});

      alert("Return/Refund request submitted.");
      
      if (target.key === "REPAIR") navigate(`/ordersummary?repairId=${target.id}`, { replace: true });
      else if (target.key === "CUSTOMIZATION") navigate(`/ordersummary?customId=${target.id}`, { replace: true });
      else navigate(`/ordersummary?orderId=${target.id}`, { replace: true });

    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to submit return request.");
    } finally {
      setSubmitting(false);
    }
  }

  // Derived UI state
  const selectedCount = sumSelected();
  let disabledReason = "";
  let mainButtonLabel = "SUBMIT";
  let isDisabled = false;

  // 1. Check existing request FIRST (highest priority)
  if (existingRequest) {
      isDisabled = true;
      if (existingRequest.status === "rejected") {
          mainButtonLabel = "REFUND REJECTED";
          disabledReason = "Your return request for this order was rejected.";
      } else if (existingRequest.status === "refund_issued") {
          mainButtonLabel = "REFUND ISSUED";
          disabledReason = "This order has already been refunded.";
      } else {
          mainButtonLabel = "RETURN PENDING";
          disabledReason = "You already have a pending return request.";
      }
  } 
  // 2. Check eligibility windows if no existing request
  else if (!eligible) {
      isDisabled = true;
      disabledReason = "Return window has ended.";
  } 
  // 3. Check form validity
  else if (selectedCount <= 0) {
      isDisabled = true;
      disabledReason = "Select at least one item to return.";
  } else if (gcashName.trim().length < 2) {
      isDisabled = true;
      disabledReason = "Enter your GCash account name.";
  } else if (!is11DigitsLoose(gcashNumber)) {
      isDisabled = true;
      disabledReason = "GCash number must be exactly 11 digits.";
  }

  if (submitting) {
      isDisabled = true;
      mainButtonLabel = "SUBMITTING...";
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
              <div><strong>Type:</strong> {originKey}</div>
            </div>

            {existingRequest && existingRequest.status === 'rejected' && (
                <div className="err" style={{ marginBottom: 12, border: "1px solid #ef4444", padding: 8, borderRadius: 6, backgroundColor: "#fef2f2", color: "#991b1b" }}>
                    <strong>Request Rejected:</strong> This return request was previously reviewed and rejected by the admin.
                </div>
            )}

            {!eligible && !existingRequest && (
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
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderTop: idx ? "1px dashed #f1f5r9" : "none" }}>
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
                          disabled={!!existingRequest} // Disable input if request exists
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                  disabled={!!existingRequest}
                >
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>

              <div style={{ fontSize: 12 }}>
                Refund method
                <div style={{ marginTop: 4, padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f8fafc" }}>
                  {REFUND_METHOD.label}
                </div>
              </div>

              <div className="card" style={{ padding: 0, border: "none" }}>
                <div style={{ fontSize: 12, marginTop: 4 }}>GCash Details</div>

                <label className="field-label" style={{ fontSize: 12, marginTop: 6 }}>Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. Juan Dela Cruz"
                  value={gcashName}
                  onChange={(e) => setGcashName(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                  disabled={!!existingRequest}
                />

                <label className="field-label" style={{ fontSize: 12, marginTop: 8 }}>Account Number</label>
                <input
                  type="tel"
                  placeholder="11-digit GCash number"
                  inputMode="numeric"
                  value={gcashNumber}
                  onChange={(e) => setGcashNumber(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                  disabled={!!existingRequest}
                />
                <small style={{ opacity: 0.8 }}>
                  We accept “0917 123 4567” or “0917-123-4567” — we’ll clean it automatically.
                </small>
              </div>
            </div>

            {!existingRequest && (
                <>
                    <label style={{ marginTop: 12, fontSize: 12 }}>Upload Photos (optional, up to 6)</label>
                    <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                    />
                </>
            )}

            <label style={{ marginTop: 12, fontSize: 12 }}>Message / Description (optional)</label>
            <textarea
              rows={6}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Tell us what went wrong…"
              style={{ width: "100%" }}
              disabled={!!existingRequest}
            />

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button className="back-btn" onClick={() => navigate(-1)} disabled={submitting}>
                GO BACK
              </button>
              <button
                className="order-btn"
                onClick={submit}
                disabled={isDisabled}
                title={disabledReason || ""}
                style={existingRequest?.status === 'rejected' ? { backgroundColor: "#9ca3af", cursor: "not-allowed" } : {}}
              >
                {mainButtonLabel}
              </button>
              {disabledReason && (
                <div className="err" style={{ marginTop: 8, fontSize: 12 }}>
                  {disabledReason}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="order-summary">
        <h3>RETURN POLICY</h3>
        <div className="order-card" style={{ padding: 16, fontSize: 14 }}>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>Return window is based on <strong>Delivered</strong> date.</li>
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