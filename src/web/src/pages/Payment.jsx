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
} from "firebase/firestore";
import { auth } from "../firebase";
import qrCodeImg from "../assets/payment.jpg";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import "../Payment.css";

const PENDING_KEY = "PENDING_CHECKOUT";

/* ───────────────── helpers ───────────────── */
// remove undefined, functions, and anything not serializable for Firestore
function deepSanitizeForFirestore(value) {
  if (value == null) return value === 0 ? 0 : null;

  if (Array.isArray(value)) {
    return value
      .map((v) => deepSanitizeForFirestore(v))
      .filter((v) => v !== undefined);
  }

  const t = typeof value;

  if (t === "string" || t === "number" || t === "boolean") return value;

  // serverTimestamp() etc — pass through
  if (t === "object") {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = deepSanitizeForFirestore(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // functions/symbols/undefined → drop
  return undefined;
}

const toC = (n) => Math.max(0, Math.round(Number(n || 0) * 100));
const Nint = (x) => Math.max(0, Math.round(Number(x || 0)));

async function uploadFileToStorage(storage, path, file) {
  const sRef = ref(storage, path);
  const metadata = file?.type ? { contentType: file.type } : undefined;
  const result = await uploadBytes(sRef, file, metadata);
  let url = null;
  try {
    url = await getDownloadURL(sRef);
  } catch {
    // If your Storage rules block reads for customers, URL will be null.
  }
  return { fullPath: result.metadata.fullPath, url };
}

export default function Payment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId") || null;
  const existingOrderId = params.get("orderId") || null;

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // what customer must pay right now (₱, string)
  const [amountPHP, setAmountPHP] = useState("");
  // when true we enable the "additional payment" path
  const [canPayAdditional, setCanPayAdditional] = useState(false);
  // loaded order (for summary card)
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
    () =>
      (pending?.origin === "customization") ||
      !!sessionStorage.getItem("custom_draft"),
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
    () =>
      items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0),
    [items]
  );
  const discount = pending?.discount ?? 69;
  const shippingFee = pending?.shippingFee ?? 510;
  const total = subtotal - discount + shippingFee;

  // guard against accidental page leave while uploading
  useEffect(() => {
    let armed = true;
    const beforeUnload = (e) => {
      if (!armed || uploading) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onPopState = () => {
      if (!armed || uploading) return;
      if (!window.confirm("Leave payment? Your order won’t be placed."))
        history.go(1);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      armed = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [uploading]);

  // Load existing order (compute "need to pay now")
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

      if (requestedC > 0) {
        allowed = true;
        nowCents = requestedC;
      } else if (
        assessedC > 0 &&
        balance > 0 &&
        String(o.paymentStatus || "").toLowerCase() ===
          "awaiting_additional_payment"
      ) {
        allowed = true;
        nowCents = balance;
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
      purchased.map(
        (it) =>
          `${String(it.productId || it.id || "")}__${String(it.size || "")}`
      )
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
      title:
        typeof it.title === "string"
          ? it.title
          : typeof it.name === "string"
          ? it.name
          : null,
      qty: Number(it.qty || 1) || 1,
      price: Number(it.price || 0) || 0,
      image: typeof it.image === "string" ? it.image : null,
    }));

  const buildSafeAddress = (addr) =>
    addr
      ? {
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
        }
      : null;

  function validateFile(f) {
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

  async function addAdminNotification({ orderId, userId, cents, storagePath, url, kind }) {
    try {
      await addDoc(
        collection(db, "admin_notifications"),
        deepSanitizeForFirestore({
          type: kind === "additional" ? "additional_payment_submitted" : "payment_proof_submitted",
          orderId,
          userId,
          amountCents: Nint(cents),
          storagePath: storagePath || null,
          url: url || null,
          createdAt: serverTimestamp(),
          read: false,
        })
      );
    } catch (e) {
      // Non-blocking
      console.warn("Failed to write admin_notifications", e);
    }
  }

  async function addOrderEvent(orderId, payload) {
    try {
      await addDoc(
        collection(db, "orders", orderId, "events"),
        deepSanitizeForFirestore({
          ...payload,
          createdAt: serverTimestamp(),
        })
      );
    } catch {
      // ignore
    }
  }

  const handleUpload = async () => {
    if (!pending && !existingOrderId) {
      alert("Your session expired. Please checkout again.");
      navigate("/cart", { replace: true });
      return;
    }
    if (!validateFile(file)) return;

    setUploading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert("Please sign in again before paying.");
        navigate("/cart", { replace: true });
        return;
      }

      const storage = getStorage(auth.app);

      // ===== Additional payment path =====
      if (existingOrderId) {
        const oRef = doc(db, "orders", existingOrderId);
        const oSnap = await getDoc(oRef);
        if (!oSnap.exists()) throw new Error("Order not found.");
        const o = oSnap.data();

        const assessedC = Nint(o.assessedTotalCents);
        const requestedC = Nint(o.requestedAdditionalPaymentCents);
        const depositC = Nint(o.depositCents);
        const addsPrev = Nint(o.additionalPaymentsCents);
        const refundsC = Nint(o.refundsCents);
        const netPaid = Math.max(0, depositC + addsPrev - refundsC);
        const balance = assessedC > 0 ? Math.max(0, assessedC - netPaid) : 0;

        const payableC =
          requestedC > 0 ? requestedC : assessedC > 0 && balance > 0 ? balance : 0;

        if (payableC <= 0) {
          alert("This order has no additional payment requested yet.");
          setUploading(false);
          return;
        }

        // upload proof
        const fileName = `${Date.now()}_${file.name || "proof"}`;
        const path = `payments/${existingOrderId}/additional_${fileName}`;
        const { fullPath, url } = await uploadFileToStorage(storage, path, file);

        const addsAfter = addsPrev + payableC;
        const netPaidAfter = Math.max(0, depositC + addsAfter - refundsC);
        const paidOff = assessedC > 0 && netPaidAfter >= assessedC;

        await updateDoc(
          oRef,
          deepSanitizeForFirestore({
            additionalPaymentsCents: addsAfter,
            lastAdditionalPaymentCents: payableC,
            lastAdditionalPaymentProofUrl: url || null,
            lastAdditionalPaymentProofPath: fullPath || path,
            requestedAdditionalPaymentCents: 0,
            paymentStatus: paidOff ? "paid" : o.paymentStatus || "deposit_paid",
            paymentUpdatedAt: serverTimestamp(),
          })
        );

        await addAdminNotification({
          orderId: existingOrderId,
          userId: uid,
          cents: payableC,
          storagePath: fullPath || path,
          url,
          kind: "additional",
        });

        await addOrderEvent(existingOrderId, {
          type: "additional_payment_submitted",
          amountCents: payableC,
          storagePath: fullPath || path,
          url: url || null,
        });

        try {
          await addDoc(
            collection(db, "users", uid, "notifications"),
            deepSanitizeForFirestore({
              userId: uid,
              type: "order_status",
              orderId: existingOrderId,
              status: paidOff ? "paid" : "deposit_paid",
              title: paidOff ? "Payment complete" : "Additional payment received",
              body: paidOff
                ? "Thanks! Your order is now fully paid."
                : `We received your additional payment of ₱${(
                    payableC / 100
                  ).toLocaleString()}.`,
              createdAt: serverTimestamp(),
              read: false,
            })
          );
        } catch {}

        alert("Additional payment uploaded!");
        navigate(`/ordersummary?orderId=${existingOrderId}`, { replace: true });
        return;
      }

      // ===== First checkout (LEAN + SANITIZED) =====
      const itemsLean = buildItemsLean(items);
      const safeAddress = buildSafeAddress(pending?.shippingAddress);

      const orderPayload = deepSanitizeForFirestore({
        userId: uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items: itemsLean,
        subtotal,
        discount,
        shippingFee,
        total,
        shippingAddress: safeAddress,
        contactEmail: safeAddress?.email || null,
        note: repairId
          ? `Created from Repair ${repairId}`
          : isCustomization
          ? "Created from Customization"
          : "Created from Checkout",
        repairId,
        paymentStatus: "pending",
        assessmentStatus: "pending",
        assessedTotalCents: null,
        depositCents: 0,
        depositIntendedCents: toC(total),
        additionalPaymentsCents: 0,
        refundsCents: 0,
        requestedAdditionalPaymentCents: 0,
        origin: isCustomization ? "customization" : "catalog",
      });

      // create order
      const orderRef = await addDoc(collection(db, "orders"), orderPayload);

      // upload payment proof
      const fileName = `${Date.now()}_${file.name || "proof"}`;
      const path = `payments/${orderRef.id}/${fileName}`;
      const { fullPath, url } = await uploadFileToStorage(storage, path, file);

      await updateDoc(
        doc(db, "orders", orderRef.id),
        deepSanitizeForFirestore({
          paymentProofUrl: url || null,       // may be null if read is disallowed
          paymentProofPath: fullPath || path, // always present for admin
          paymentUpdatedAt: serverTimestamp(),
          paymentStatus: "pending",
        })
      );

      await addAdminNotification({
        orderId: orderRef.id,
        userId: uid,
        cents: toC(total),
        storagePath: fullPath || path,
        url,
        kind: "initial",
      });

      await addOrderEvent(orderRef.id, {
        type: "payment_proof_submitted",
        amountCents: toC(total),
        storagePath: fullPath || path,
        url: url || null,
      });

      // create linked customization record (LEAN) + (optional) refs
      if (isCustomization && customDraft) {
        let referenceImages = [];
        try {
          if (
            Array.isArray(customDraft.referenceImagesData) &&
            customDraft.referenceImagesData.length
          ) {
            const toUpload = customDraft.referenceImagesData.slice(0, 3);
            const uploads = toUpload.map((r, i) =>
              uploadFileToStorage(
                storage,
                `payments/${orderRef.id}/ref_${Date.now()}_${i}.jpg`,
                // Convert dataURL to Blob for consistency
                dataURLtoBlob(r.dataUrl)
              )
            );
            const results = await Promise.all(uploads);
            referenceImages = results.map((r) => r.url || r.fullPath);
          }
        } catch (e) {
          console.warn("Reference image upload failed; continuing without refs:", e);
          referenceImages = [];
        }

        const customLean = {
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

          additionals: Array.isArray(customDraft.additionals)
            ? customDraft.additionals.map(String)
            : [],
          notes: customDraft.notes ?? "",

          descriptionFromProduct: customDraft.descriptionFromProduct ?? null,
          unitPrice: Number(customDraft.unitPrice ?? 0) || 0,

          images: Array.isArray(customDraft.images)
            ? customDraft.images.filter((u) => typeof u === "string")
            : [],

          referenceImages,
        };

        await addDoc(
          collection(db, "custom_orders"),
          deepSanitizeForFirestore(customLean)
        );
      }

      // notify + cleanup
      try {
        await addDoc(
          collection(db, "users", uid, "notifications"),
          deepSanitizeForFirestore({
            userId: uid,
            type: repairId ? "repair_order_placed" : "order_placed",
            orderId: orderRef.id,
            ...(repairId ? { repairId } : {}),
            status: "processing",
            title: "Thanks! We’re reviewing your payment.",
            body: `We received your payment proof for order ${String(
              orderRef.id
            ).slice(0, 6)}.`,
            image: itemsLean?.[0]?.image ?? null,
            link: `/ordersummary?orderId=${orderRef.id}`,
            createdAt: serverTimestamp(),
            read: false,
          })
        );
      } catch {}

      try {
        await removeItemsFromCart(uid, items);
      } catch {}
      sessionStorage.removeItem(PENDING_KEY);
      try {
        clearCheckoutItems();
      } catch {}
      try {
        sessionStorage.removeItem("custom_draft");
      } catch {}

      alert("Payment proof uploaded! Waiting for admin confirmation.");
      navigate(`/ordersummary?orderId=${orderRef.id}`, { replace: true });
    } catch (e) {
      console.error(e);
      alert("Failed to submit payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Utility: convert dataURL → Blob (for customization refs)
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
        <img
          src={qrCodeImg}
          alt="Payment QR Code"
          style={{ maxWidth: "240px", margin: "12px 0" }}
        />

        {existingOrderId && (
          <>
            <label>Amount to pay now (₱)</label>
            <input type="number" min="0" step="1" value={amountPHP} disabled />
            {!canPayAdditional ? (
              <div
                style={{ margin: "6px 0 12px", fontSize: 13, color: "#6b7280" }}
              >
                Waiting for admin to request an additional payment or finalize
                the assessment.
              </div>
            ) : (
              <div
                style={{ margin: "6px 0 12px", fontSize: 13, color: "#374151" }}
              >
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
        {errMsg ? (
          <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{errMsg}</div>
        ) : null}

        <div className="form-actions">
          <button
            className="back-btn"
            onClick={() => {
              if (
                window.confirm(
                  "If you go back now, your order won’t be placed. Go back?"
                )
              )
                navigate(-1);
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
              ? canPayAdditional
                ? "SUBMIT ADDITIONAL PAYMENT"
                : "WAITING FOR REQUEST"
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
