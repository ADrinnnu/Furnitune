// src/pages/Payment.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getFirestore,
  addDoc,
  collection,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  arrayUnion,
} from "firebase/firestore";
import { auth } from "../firebase";
import qrCodeImg from "../assets/payment.jpg";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import "../Payment.css";

const PENDING_KEY = "PENDING_CHECKOUT";

/* ───────────────── helpers ───────────────── */
function deepSanitizeForFirestore(value) {
  if (value == null) return value === 0 ? 0 : null;
  if (Array.isArray(value)) return value.map((v) => deepSanitizeForFirestore(v)).filter((v) => v !== undefined);
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = deepSanitizeForFirestore(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return undefined;
}

const toC = (n) => Math.max(0, Math.round(Number(n || 0) * 100));
const Nint = (x) => Math.max(0, Math.round(Number(x || 0)));

function validateFile(f, setErrMsg) {
  setErrMsg("");
  if (!f) {
    setErrMsg("Please upload your payment screenshot.");
    return false;
  }
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (f.type && !allowed.includes(f.type)) {
    setErrMsg("File must be an image (jpg, png, webp).");
    return false;
  }
  const maxMB = 15;
  if (f.size > maxMB * 1024 * 1024) {
    setErrMsg(`Image is too large. Max ${maxMB}MB.`);
    return false;
  }
  return true;
}

/** Upload to payments/{orderId}/..., else fallback to userPayments/{uid}/... */
async function uploadPaymentProofWithFallback(storage, { orderId, uid, file, kind }) {
  const stamp = Date.now();
  const cleanName = file?.name ? file.name.replace(/[^\w.\-]+/g, "_") : "proof.jpg";
  const metadata = file?.type ? { contentType: file.type } : undefined;

  const primaryName =
    kind === "additional" ? `additional_${stamp}_${cleanName}`
    : kind === "ref"       ? `ref_${stamp}_${cleanName}`
    :                        `${stamp}_${cleanName}`;
  const primaryPath = `payments/${orderId}/${primaryName}`;

  try {
    const pRef = ref(storage, primaryPath);
    const res = await uploadBytes(pRef, file, metadata);
    let url = null;
    try { url = await getDownloadURL(pRef); } catch {}
    return { storagePath: res.metadata.fullPath || primaryPath, url, used: "payments" };
  } catch {
    const fallbackName = `order-${orderId}_${stamp}_${cleanName}`;
    const fallbackPath = `userPayments/${uid}/${fallbackName}`;
    const fRef = ref(storage, fallbackPath);
    const res = await uploadBytes(fRef, file, metadata);
    let url = null;
    try { url = await getDownloadURL(fRef); } catch {}
    return { storagePath: res.metadata.fullPath || fallbackPath, url, used: "userPayments" };
  }
}

export default function Payment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId") || null;
  const existingOrderId = params.get("orderId") || null;

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [amountPHP, setAmountPHP] = useState("");
  const [canPayAdditional, setCanPayAdditional] = useState(false);
  const [existingOrder, setExistingOrder] = useState(null);

  const db = useMemo(() => getFirestore(auth.app), []);

  const pending = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const isCustomization = useMemo(
    () => (pending?.origin === "customization") || !!sessionStorage.getItem("custom_draft"),
    [pending]
  );

  const customDraft = useMemo(() => {
    if (pending?.customization) return pending.customization;
    try {
      const raw = sessionStorage.getItem("custom_draft");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [pending]);

  useEffect(() => {
    if (!existingOrderId && !pending) navigate("/cart", { replace: true });
  }, [pending, existingOrderId, navigate]);

  const items = useMemo(
    () => (pending?.items?.length ? pending.items : getCheckoutItems()),
    [pending]
  );

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0),
    [items]
  );
  const discount = pending?.discount ?? 69;
  const shippingFee = pending?.shippingFee ?? 510;
  const total = subtotal - discount + shippingFee;

  // prevent accidental leave
  useEffect(() => {
    let armed = true;
    const beforeUnload = (e) => { if (!armed || uploading) return; e.preventDefault(); e.returnValue = ""; };
    const onPopState = () => { if (!armed || uploading) return; if (!window.confirm("Leave payment? Your order won’t be placed.")) history.go(1); };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => { armed = false; window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", onPopState); };
  }, [uploading]);

  // load existing order for addl payment
  useEffect(() => {
    (async () => {
      if (!existingOrderId) return;
      const snap = await getDoc(doc(db, "orders", existingOrderId));
      if (!snap.exists()) {
        alert("Order not found.");
        navigate("/", { replace: true });
        return;
      }
      const o = { id: snap.id, ...snap.data() };
      setExistingOrder(o);

      const assessedC = Nint(o.assessedTotalCents);
      const requestedC = Nint(o.requestedAdditionalPaymentCents);
      const depositC = Nint(o.depositCents);
      const addsC = Nint(o.additionalPaymentsCents);
      const refundsC = Nint(o.refundsCents);
      const netPaid = Math.max(0, depositC + addsC - refundsC);
      const balance = assessedC > 0 ? Math.max(0, assessedC - netPaid) : 0;

      let allowed = false;
      let nowCents = 0;

      if (requestedC > 0) { allowed = true; nowCents = requestedC; }
      else if (assessedC > 0 && balance > 0 && String(o.paymentStatus || "").toLowerCase() === "awaiting_additional_payment") {
        allowed = true; nowCents = balance;
      }

      setCanPayAdditional(allowed);
      setAmountPHP(allowed ? (nowCents / 100).toFixed(0) : "");
    })();
  }, [db, existingOrderId, navigate]);

  async function removeItemsFromCart(uid, purchased) {
    if (!uid || !Array.isArray(purchased) || purchased.length === 0) return;
    const snap = await getDocs(collection(db, "users", uid, "cart"));
    const deletions = [];
    const wanted = new Set(
      purchased.map((it) => `${String(it.productId || it.id || "")}__${String(it.size || "")}`)
    );
    snap.forEach((d) => {
      const c = d.data() || {};
      const key = `${String(c.productId || c.id || "")}__${String(c.size || "")}`;
      if (wanted.has(key)) deletions.push(deleteDoc(d.ref));
    });
    if (deletions.length) await Promise.all(deletions);
  }

  const buildItemsLean = (sourceItems) =>
    (Array.isArray(sourceItems) ? sourceItems : []).map((it) => ({
      title: typeof it.title === "string" ? it.title : (typeof it.name === "string" ? it.name : null),
      qty: Number(it.qty || 1) || 1,
      price: Number(it.price || 0) || 0,
      image: typeof it.image === "string" ? it.image : null,
    }));

  const buildSafeAddress = (addr) =>
    addr ? {
      fullName: addr.fullName ?? null,
      firstName: addr.firstName ?? null,
      lastName: addr.lastName ?? null,
      email: addr.email ?? null,
      phone: addr.phone ?? null,
      line1: addr.line1 ?? null,
      line2: addr.line2 ?? "",
      city: addr.city ?? null,
      province: addr.province ?? null,
      zip: addr.zip ?? null,
      newsletterOptIn: !!addr.newsletterOptIn,
    } : null;

  async function addAdminNotification({ orderId, userId, cents, storagePath, url, kind }) {
    try {
      await addDoc(collection(db, "admin_notifications"), deepSanitizeForFirestore({
        type: kind === "additional" ? "additional_payment_submitted" : "payment_proof_submitted",
        orderId, userId,
        amountCents: Nint(cents),
        storagePath: storagePath || null,
        url: url || null,
        createdAt: serverTimestamp(),
        read: false,
      }));
    } catch (e) {
      console.warn("admin_notifications failed", e);
    }
  }

  async function addOrderEvent(orderId, payload) {
    try {
      await addDoc(collection(db, "orders", orderId, "events"), deepSanitizeForFirestore({
        ...payload, createdAt: serverTimestamp(),
      }));
    } catch {}
  }

  function dataURLtoBlob(dataUrl) {
    const m = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
    if (!m) throw new Error("Bad data URL");
    const contentType = m[1];
    const bstr = atob(m[2]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: contentType });
  }

  const handleUpload = async () => {
    if (!pending && !existingOrderId) {
      alert("Your session expired. Please checkout again.");
      navigate("/cart", { replace: true });
      return;
    }
    if (!validateFile(file, setErrMsg)) return;

    setUploading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert("Please sign in again before paying.");
        navigate("/cart", { replace: true });
        return;
      }
      const storage = getStorage(auth.app);

      /* ───────────────── Additional payment ───────────────── */
      if (existingOrderId) {
        const oRef = doc(db, "orders", existingOrderId);
        const oSnap = await getDoc(oRef);
        if (!oSnap.exists()) throw new Error("Order not found.");
        const orderData = oSnap.data();

        const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
          orderId: existingOrderId, uid, file, kind: "additional",
        });

        const amountCents = Nint(Number(amountPHP)) * 100 || null;

        // Update order with proof (keep legacy field for admin UI image)
        await updateDoc(oRef, deepSanitizeForFirestore({
          paymentProofPendingReview: true,
          paymentProofType: "additional",
          paymentProofUpdatedAt: serverTimestamp(),
          lastAdditionalPaymentProofUrl: url || null,
          lastAdditionalPaymentProofPath: storagePath || null,
          paymentProofUrl: url || null, // legacy so Admin Orders shows image
          additionalPaymentProofs: arrayUnion({
            url: url || null,
            uploadedAt: serverTimestamp(),
            amountCents,
            note: null,
          }),
        }));

        // Mirror to origin doc
        try {
          if (orderData?.repairId) {
            await updateDoc(doc(db, "repairs", orderData.repairId), deepSanitizeForFirestore({
              paymentProofPendingReview: true,
              paymentProofType: "additional",
              paymentProofUpdatedAt: serverTimestamp(),
              lastAdditionalPaymentProofUrl: url || null,
              lastAdditionalPaymentProofPath: storagePath || null,
              additionalPaymentProofs: arrayUnion({
                url: url || null,
                uploadedAt: serverTimestamp(),
                amountCents,
                note: null,
              }),
            }));
          } else {
            const qy = query(collection(db, "custom_orders"), where("orderId", "==", existingOrderId));
            const cs = await getDocs(qy);
            const cRef = cs.docs[0]?.ref;
            if (cRef) {
              await updateDoc(cRef, deepSanitizeForFirestore({
                paymentProofPendingReview: true,
                paymentProofType: "additional",
                paymentProofUpdatedAt: serverTimestamp(),
                lastAdditionalPaymentProofUrl: url || null,
                lastAdditionalPaymentProofPath: storagePath || null,
                additionalPaymentProofs: arrayUnion({
                  url: url || null,
                  uploadedAt: serverTimestamp(),
                  amountCents,
                  note: null,
                }),
              }));
            }
          }
        } catch (e) {
          console.warn("Origin mirror (additional) failed:", e);
        }

        await addAdminNotification({ orderId: existingOrderId, userId: uid, cents: amountCents, storagePath, url, kind: "additional" });
        await addOrderEvent(existingOrderId, { type: "additional_payment_submitted", amountCents, storagePath, url: url || null });

        try {
          await addDoc(collection(db, "users", uid, "notifications"), deepSanitizeForFirestore({
            userId: uid,
            type: "order_status",
            orderId: existingOrderId,
            status: "processing",
            title: "Additional payment submitted",
            body: "Thanks! We’re reviewing your additional payment proof.",
            createdAt: serverTimestamp(),
            read: false,
          }));
        } catch {}

        alert("Additional payment proof uploaded. We’ll review it shortly.");
        navigate(`/ordersummary?orderId=${existingOrderId}`, { replace: true });
        return;
      }

      /* ───────────────── First checkout (new order) ───────────────── */
      const itemsLean = buildItemsLean(items);
      const safeAddress = buildSafeAddress(pending?.shippingAddress);

      const orderPayload = deepSanitizeForFirestore({
        userId: uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items: itemsLean,
        subtotal, discount, shippingFee, total,
        shippingAddress: safeAddress,
        contactEmail: safeAddress?.email || null,
        note: repairId ? `Created from Repair ${repairId}` : (isCustomization ? "Created from Customization" : "Created from Checkout"),
        repairId,
        origin: isCustomization ? "customization" : "catalog",

        // Payments meta (neutral)
        paymentStatus: "pending",
        paymentProofPendingReview: true,
        paymentProofType: "deposit",
        paymentProofUpdatedAt: serverTimestamp(),

        assessmentStatus: "pending",
        assessedTotalCents: null,
        depositCents: 0,
        depositIntendedCents: toC(total),
        additionalPaymentsCents: 0,
        refundsCents: 0,
        requestedAdditionalPaymentCents: 0,
      });

      // create order
      const orderRef = await addDoc(collection(db, "orders"), orderPayload);

      // upload payment proof (initial)
      const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
        orderId: orderRef.id, uid, file, kind: "initial",
      });

      // Store on order (legacy + structured fields)
      await updateDoc(doc(db, "orders", orderRef.id), deepSanitizeForFirestore({
        paymentProofUrl: url || null,               // legacy for Admin Orders image
        depositPaymentProofUrl: url || null,
        depositPaymentProofs: arrayUnion({
          url: url || null,
          uploadedAt: serverTimestamp(),
          amountCents: null,
          note: null,
        }),
        paymentProofPendingReview: true,
        paymentProofType: "deposit",
        paymentProofUpdatedAt: serverTimestamp(),
      }));

      await addAdminNotification({ orderId: orderRef.id, userId: uid, cents: toC(total), storagePath, url, kind: "initial" });
      await addOrderEvent(orderRef.id, { type: "payment_proof_submitted", amountCents: toC(total), storagePath, url: url || null });

      // Customization: create custom_orders with full customer + proof fields
      if (isCustomization && customDraft) {
        let referenceImages = [];
        try {
          if (Array.isArray(customDraft.referenceImagesData) && customDraft.referenceImagesData.length) {
            const toUpload = customDraft.referenceImagesData.slice(0, 3);
            const results = await Promise.all(
              toUpload.map((r) =>
                uploadPaymentProofWithFallback(storage, {
                  orderId: orderRef.id,
                  uid,
                  file: dataURLtoBlob(r.dataUrl),
                  kind: "ref",
                })
              )
            );
            referenceImages = results.map((r) => r.url || r.storagePath);
          }
        } catch (e) {
          console.warn("Reference image upload failed; continuing without refs:", e);
          referenceImages = [];
        }

        const customLean = deepSanitizeForFirestore({
          userId: uid,
          orderId: orderRef.id,
          createdAt: serverTimestamp(),
          status: "processing",

          productId: customDraft.productId ?? null,
          productTitle: customDraft.productTitle ?? null,
          category: customDraft.category ?? null,
          size: customDraft.size ?? null,

          cover: {
            materialType: customDraft?.cover?.materialType ?? null,
            color: customDraft?.cover?.color ?? null,
          },
          additionals: Array.isArray(customDraft.additionals) ? customDraft.additionals.map(String) : [],
          notes: customDraft.notes ?? "",

          descriptionFromProduct: customDraft.descriptionFromProduct ?? null,
          unitPrice: Number(customDraft.unitPrice ?? 0) || 0,

          images: Array.isArray(customDraft.images) ? customDraft.images.filter((u) => typeof u === "string") : [],
          referenceImages,

          // customer info
          shippingAddress: safeAddress || null,
          contactEmail: safeAddress?.email || null,

          // initial proof mirrored
          paymentStatus: "pending",
          paymentProofPendingReview: true,
          paymentProofType: "deposit",
          paymentProofUpdatedAt: serverTimestamp(),
          paymentProofUrl: url || null,          // legacy view support (if admin lists custom directly)
          depositPaymentProofUrl: url || null,
          depositPaymentProofs: [{
            url: url || null,
            uploadedAt: serverTimestamp(),
            amountCents: null,
            note: null,
          }],
        });

        await addDoc(collection(db, "custom_orders"), customLean);
      }

      // Repairs: patch repair doc with shipping + initial proof
      if (repairId) {
        try {
          await updateDoc(doc(db, "repairs", repairId), deepSanitizeForFirestore({
            orderId: orderRef.id,
            shippingAddress: safeAddress || null,
            contactEmail: safeAddress?.email || null,
            userId: uid,
            createdAt: serverTimestamp(),

            paymentStatus: "pending",
            paymentProofPendingReview: true,
            paymentProofType: "deposit",
            paymentProofUpdatedAt: serverTimestamp(),
            paymentProofUrl: url || null, // for any admin list that reads this directly
            depositPaymentProofUrl: url || null,
            depositPaymentProofs: arrayUnion({
              url: url || null,
              uploadedAt: serverTimestamp(),
              amountCents: null,
              note: null,
            }),
          }));
        } catch (e) {
          console.warn("Repair mirror (initial) failed:", e?.message || e);
        }
      }

      // notify + cleanup
      try {
        await addDoc(collection(db, "users", uid, "notifications"), deepSanitizeForFirestore({
          userId: uid,
          type: repairId ? "repair_order_placed" : "order_placed",
          orderId: orderRef.id,
          ...(repairId ? { repairId } : {}),
          status: "processing",
          title: "Thanks! We’re reviewing your payment.",
          body: `We received your payment proof for order ${String(orderRef.id).slice(0, 6)}.`,
          image: itemsLean?.[0]?.image ?? null,
          link: `/ordersummary?orderId=${orderRef.id}`,
          createdAt: serverTimestamp(),
          read: false,
        }));
      } catch {}

      try { await removeItemsFromCart(uid, items); } catch {}
      sessionStorage.removeItem(PENDING_KEY);
      try { clearCheckoutItems(); } catch {}
      try { sessionStorage.removeItem("custom_draft"); } catch {}

      alert("Payment proof uploaded! Waiting for admin confirmation.");
      navigate(`/ordersummary?orderId=${orderRef.id}`, { replace: true });
    } catch (e) {
      console.error(e);
      alert("Failed to submit payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const summaryOrder =
    existingOrderId && existingOrder
      ? existingOrder
      : { items, subtotal, discount, shippingFee, total };

  return (
    <div className="payment-container">
      <div className="payment-form">
        <h3>PAYMENT VIA QR CODE</h3>
        <hr />
        <p>Please scan the QR code below and upload your proof of payment.</p>
        <img src={qrCodeImg} alt="Payment QR Code" style={{ maxWidth: "240px", margin: "12px 0" }} />

        {existingOrderId && (
          <>
            <label>Amount to pay now (₱)</label>
            <input type="number" min="0" step="1" value={amountPHP} disabled />
            {!canPayAdditional ? (
              <div style={{ margin: "6px 0 12px", fontSize: 13, color: "#6b7280" }}>
                Waiting for admin to request an additional payment or finalize the assessment.
              </div>
            ) : (
              <div style={{ margin: "6px 0 12px", fontSize: 13, color: "#374151" }}>
                This amount is locked based on your order’s current balance.
              </div>
            )}
          </>
        )}

        <label>Upload Payment Proof*</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={uploading}
        />
        {errMsg ? <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{errMsg}</div> : null}

        <div className="form-actions">
          <button
            className="back-btn"
            onClick={() => {
              if (window.confirm("If you go back now, your order won’t be placed. Go back?")) navigate(-1);
            }}
            disabled={uploading}
          >
            GO BACK
          </button>
          <button
            className="order-btn"
            onClick={handleUpload}
            disabled={uploading || (existingOrderId && !canPayAdditional)}
          >
            {uploading
              ? "UPLOADING…"
              : existingOrderId
              ? (canPayAdditional ? "SUBMIT ADDITIONAL PAYMENT" : "WAITING FOR REQUEST")
              : "SUBMIT PAYMENT PROOF"}
          </button>
        </div>
      </div>

      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>
        <OrderSummaryCard
          title="ORDER SUMMARY"
          showSupport
          showAddress={false}
          order={summaryOrder}
          items={!existingOrderId ? items : undefined}
          discount={!existingOrderId ? discount : undefined}
          shippingFee={!existingOrderId ? shippingFee : undefined}
        />
      </div>
    </div>
  );
}
