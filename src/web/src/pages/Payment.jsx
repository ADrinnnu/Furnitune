import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  setDoc, // still used for catalog orders
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  arrayUnion,
  limit as qLimit,
} from "firebase/firestore";
import { auth, firestore as db } from "../firebase";
import qrCodeImg from "../assets/payment.jpg";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import "../Payment.css";

const PENDING_KEY = "PENDING_CHECKOUT";

/* ───────────────── helpers ───────────────── */
// IMPORTANT: keep FieldValue sentinels (serverTimestamp, arrayUnion) intact.
function deepSanitizeForFirestore(value) {
  if (value == null) return value === 0 ? 0 : null;

  // Firestore FieldValue sentinel objects
  if (typeof value === "object" && value !== null && typeof value._methodName === "string") {
    return value;
  }

  // Dates & binary-like values
  if (value instanceof Date || value instanceof Blob || value instanceof File) return value;

  if (Array.isArray(value)) {
    return value.map((v) => deepSanitizeForFirestore(v)).filter((v) => v !== undefined);
  }

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

/** Upload to payments/{id}/..., else fallback to userPayments/{uid}/... */
async function uploadPaymentProofWithFallback(storage, { orderId, uid, file, kind }) {
  const stamp = Date.now();
  const cleanName = file?.name ? file.name.replace(/[^\w.\-]+/g, "_") : "proof.jpg";
  const metadata = file?.type ? { contentType: file.type } : undefined;

  const primaryName =
    kind === "additional"
      ? `additional_${stamp}_${cleanName}`
      : kind === "ref"
      ? `ref_${stamp}_${cleanName}`
      : `${stamp}_${cleanName}`;
  const primaryPath = `payments/${orderId}/${primaryName}`;

  try {
    const pRef = ref(storage, primaryPath);
    const res = await uploadBytes(pRef, file, metadata);
    let url = null;
    try {
      url = await getDownloadURL(pRef);
    } catch {}
    return { storagePath: res.metadata.fullPath || primaryPath, url, used: "payments" };
  } catch {
    const fallbackName = `order-${orderId}_${stamp}_${cleanName}`;
    const fallbackPath = `userPayments/${uid}/${fallbackName}`;
    const fRef = ref(storage, fallbackPath);
    const res = await uploadBytes(fRef, file, metadata);
    let url = null;
    try {
      url = await getDownloadURL(fRef);
    } catch {}
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

  const pending = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const isCustomization = useMemo(
    () => pending?.origin === "customization" || !!sessionStorage.getItem("custom_draft"),
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
  const shippingFee = pending?.shippingFee ?? 510;
  const total = subtotal + shippingFee;

  // prevent accidental leave
  useEffect(() => {
    let armed = true;
    const beforeUnload = (e) => {
      if (!armed || uploading) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onPopState = () => {
      if (!armed || uploading) return;
      if (!window.confirm("Leave payment? Your order won’t be placed.")) history.go(1);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      armed = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [uploading]);

  // load existing order for addl payment (orders/custom_orders/repairs)
  useEffect(() => {
    (async () => {
      if (!existingOrderId) return;

      // Try orders/{id}, then custom_orders/{id}, then repairs/{id}
      let snap = await getDoc(doc(db, "orders", existingOrderId));
      let kind = "orders";

      if (!snap.exists()) {
        const customRef = doc(db, "custom_orders", existingOrderId);
        const customSnap = await getDoc(customRef);
        if (customSnap.exists()) {
          snap = customSnap;
          kind = "custom";
        } else {
          const repairRef = doc(db, "repairs", existingOrderId);
          const repairSnap = await getDoc(repairRef);
          if (!repairSnap.exists()) {
            alert("Order not found.");
            navigate("/", { replace: true });
            return;
          }
          snap = repairSnap;
          kind = "repairs";
        }
      }

      const raw = snap.data() || {};
      const o = { id: snap.id, ...raw, _kind: kind };
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
        String(o.paymentStatus || "").toLowerCase() === "awaiting_additional_payment"
      ) {
        allowed = true;
        nowCents = balance;
      }

      setCanPayAdditional(allowed);
      setAmountPHP(allowed ? (nowCents / 100).toFixed(0) : "");
    })();
  }, [existingOrderId, navigate]);

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

  async function addAdminNotification({ orderId, userId, cents, storagePath, url, kind }) {
    try {
      await addDoc(
        collection(db, "admin_notifications"),
        deepSanitizeForFirestore({
          type:
            kind === "additional"
              ? "additional_payment_submitted"
              : "payment_proof_submitted",
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
      console.warn("admin_notifications failed", e);
    }
  }

  // 🔁 now supports different top-level collections (orders/custom_orders/repairs)
  async function addOrderEvent(orderId, payload, collName = "orders") {
    try {
      await addDoc(
        collection(db, collName, orderId, "events"),
        deepSanitizeForFirestore({
          ...payload,
          createdAt: serverTimestamp(),
        })
      );
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

      /* ───────────────── Additional payment (existing order/custom/repair doc) ───────────────── */
      if (existingOrderId) {
        // Detect whether this id lives in orders, custom_orders or repairs
        let primaryRef = doc(db, "orders", existingOrderId);
        let primarySnap = await getDoc(primaryRef);
        let primaryKind = "orders"; // "orders" | "custom" | "repairs"

        if (!primarySnap.exists()) {
          const customRef = doc(db, "custom_orders", existingOrderId);
          const customSnap = await getDoc(customRef);
          if (customSnap.exists()) {
            primaryRef = customRef;
            primarySnap = customSnap;
            primaryKind = "custom";
          } else {
            const repairRef = doc(db, "repairs", existingOrderId);
            const repairSnap = await getDoc(repairRef);
            if (!repairSnap.exists()) throw new Error("Order not found.");
            primaryRef = repairRef;
            primarySnap = repairSnap;
            primaryKind = "repairs";
          }
        }

        const orderData = primarySnap.data() || {};

        const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
          orderId: existingOrderId,
          uid,
          file,
          kind: "additional",
        });

        const amountCents = Nint(Number(amountPHP)) * 100 || null;

        const patchBase = {
          paymentProofPendingReview: true,
          paymentProofType: "additional",
          paymentProofUpdatedAt: new Date(),
          lastAdditionalPaymentProofUrl: url || null,
          lastAdditionalPaymentProofPath: storagePath || null,
          paymentProofUrl: url || null,
          additionalPaymentProofs: arrayUnion({
            url: url || null,
            uploadedAt: new Date(),
            amountCents,
            note: null,
          }),
        };

        await updateDoc(primaryRef, deepSanitizeForFirestore(patchBase));

        // Mirror to linked docs
        if (primaryKind === "orders") {
          // Mirror to origin doc (repair/custom) if any
          try {
            if (orderData?.repairId) {
              await updateDoc(
                doc(db, "repairs", orderData.repairId),
                deepSanitizeForFirestore(patchBase)
              );
            } else {
              const qy = query(
                collection(db, "custom_orders"),
                where("orderId", "==", existingOrderId)
              );
              const cs = await getDocs(qy);
              const cRef = cs.docs[0]?.ref;
              if (cRef) {
                await updateDoc(cRef, deepSanitizeForFirestore(patchBase));
              }
            }
          } catch (e) {
            console.warn("Origin mirror (additional) failed:", e);
          }
        } else if (primaryKind === "custom") {
          // primary is custom_orders; mirror to linked orders/{orderId} if it exists
          try {
            if (orderData?.orderId) {
              await updateDoc(
                doc(db, "orders", orderData.orderId),
                deepSanitizeForFirestore(patchBase)
              );
            }
          } catch (e) {
            console.warn("Linked order mirror (additional) failed:", e);
          }
        } else if (primaryKind === "repairs") {
          // primary is repairs; optionally mirror to linked orders if ever present
          try {
            if (orderData?.orderId) {
              await updateDoc(
                doc(db, "orders", orderData.orderId),
                deepSanitizeForFirestore(patchBase)
              );
            }
          } catch (e) {
            console.warn("Linked order mirror (repair additional) failed:", e);
          }
        }

        await addAdminNotification({
          orderId: existingOrderId,
          userId: uid,
          cents: amountCents,
          storagePath,
          url,
          kind: "additional",
        });

        // choose the correct collection for events
        const collNameForEvents =
          primaryKind === "custom"
            ? "custom_orders"
            : primaryKind === "repairs"
            ? "repairs"
            : "orders";

        await addOrderEvent(
          existingOrderId,
          {
            type: "additional_payment_submitted",
            amountCents,
            storagePath,
            url: url || null,
          },
          collNameForEvents
        );

        // user notification (different payload for repairs)
        try {
          const notifPayload =
            primaryKind === "repairs"
              ? {
                  userId: uid,
                  type: "repair_status",
                  repairId: existingOrderId,
                  status: "processing",
                  title: "Additional payment submitted",
                  body:
                    "Thanks! We’re reviewing your additional payment proof for your repair.",
                  createdAt: new Date(),
                  read: false,
                }
              : {
                  userId: uid,
                  type: "order_status",
                  orderId: existingOrderId,
                  status: "processing",
                  title: "Additional payment submitted",
                  body: "Thanks! We’re reviewing your additional payment proof.",
                  createdAt: new Date(),
                  read: false,
                };

          await addDoc(
            collection(db, "users", uid, "notifications"),
            deepSanitizeForFirestore(notifPayload)
          );
        } catch {}

        alert("Additional payment proof uploaded. We’ll review it shortly.");

        // Go back to the correct summary page depending on where this id lives
        const qs =
          primaryKind === "orders"
            ? `orderId=${existingOrderId}`
            : primaryKind === "custom"
            ? `customId=${existingOrderId}`
            : `repairId=${existingOrderId}`;
        navigate(`/ordersummary?${qs}`, { replace: true });
        return;
      }

      /* ───────────────── First checkout (new “order”) ───────────────── */

      const itemsLean = buildItemsLean(items);
      const safeAddress = buildSafeAddress(pending?.shippingAddress);

      /* ───── REPAIR CHECKOUT: write only to repairs/{repairId} ───── */
      if (repairId) {
        const repairRef = doc(db, "repairs", repairId);

        const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
          orderId: repairId,
          uid,
          file,
          kind: "initial",
        });

        const repairPatch = deepSanitizeForFirestore({
          userId: uid,
          status: "processing",
          origin: "repair",
          shippingAddress: safeAddress || null,
          contactEmail: safeAddress?.email || null,

          // unified payment fields
          paymentStatus: "pending",
          assessmentStatus: "pending",
          assessedTotalCents: null,
          depositCents: 0,
          depositIntendedCents: toC(total),
          additionalPaymentsCents: 0,
          refundsCents: 0,
          requestedAdditionalPaymentCents: 0,

          paymentProofPendingReview: true,
          paymentProofType: "deposit",
          paymentProofUpdatedAt: new Date(),
          paymentProofUrl: url || null,
          depositPaymentProofUrl: url || null,
          depositPaymentProofs: arrayUnion({
            url: url || null,
            uploadedAt: new Date(),
            amountCents: null,
            note: null,
          }),
        });

        await updateDoc(repairRef, repairPatch);

        await addAdminNotification({
          orderId: repairId, // we use repairId as reference id
          userId: uid,
          cents: toC(total),
          storagePath,
          url,
          kind: "initial",
        });

        // user notification
        try {
          await addDoc(
            collection(db, "users", uid, "notifications"),
            deepSanitizeForFirestore({
              userId: uid,
              type: "repair_order_placed",
              repairId,
              status: "processing",
              title: "Thanks! We’re reviewing your payment.",
              body: `We received your payment proof for repair ${String(repairId).slice(
                0,
                6
              )}.`,
              image: itemsLean?.[0]?.image ?? null,
              link: `/ordersummary?repairId=${repairId}`,
              createdAt: new Date(),
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

        alert("Payment proof uploaded! Waiting for admin confirmation.");
        navigate(`/ordersummary?repairId=${repairId}`, { replace: true });
        return;
      }

      /* ───── CUSTOMIZATION CHECKOUT: write only to custom_orders ───── */
      if (isCustomization && customDraft) {
        // use the lean cart items we already built
        const customItems = itemsLean;
        const customSubtotal = customItems.reduce(
          (s, it) => s + Number(it.price || 0) * Number(it.qty || 1),
          0
        );
        const customTotal = customSubtotal + shippingFee;

        // pick existing custom id if available, else create a new one
        let customId = customDraft.id || customDraft.customId || null;
        let customRef;
        if (customId) {
          customRef = doc(db, "custom_orders", customId);
        } else {
          customRef = doc(collection(db, "custom_orders"));
          customId = customRef.id;
        }

        // upload main payment proof using customId namespace
        const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
          orderId: customId,
          uid,
          file,
          kind: "initial",
        });

        // upload up to 3 reference images (data URLs) tied to same customId
        let referenceImages = [];
        try {
          if (
            Array.isArray(customDraft.referenceImagesData) &&
            customDraft.referenceImagesData.length
          ) {
            const toUpload = customDraft.referenceImagesData.slice(0, 3);
            const results = await Promise.all(
              toUpload.map((r) =>
                uploadPaymentProofWithFallback(storage, {
                  orderId: customId,
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

        const customPayload = deepSanitizeForFirestore({
          userId: uid,
          createdAt: customDraft.createdAt || serverTimestamp(),
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

          // ✅ pricing + cart fields so OrderSummaryCard can show totals & items
          unitPrice:
            customItems[0]?.price ??
            Number(customDraft.unitPrice ?? customSubtotal ?? 0),
          items: customItems,
          subtotal: customSubtotal,
          shippingFee,
          total: customTotal,

          images: Array.isArray(customDraft.images)
            ? customDraft.images.filter((u) => typeof u === "string")
            : [],
          referenceImages,

          // customer info
          shippingAddress: safeAddress || null,
          contactEmail: safeAddress?.email || null,

          // unified payment fields (same structure as orders)
          paymentStatus: "pending",
          assessmentStatus: "pending",
          assessedTotalCents: null,
          depositCents: 0,
          depositIntendedCents: toC(customTotal),
          additionalPaymentsCents: 0,
          refundsCents: 0,
          requestedAdditionalPaymentCents: 0,

          paymentProofPendingReview: true,
          paymentProofType: "deposit",
          paymentProofUpdatedAt: new Date(),
          paymentProofUrl: url || null,
          depositPaymentProofUrl: url || null,
          depositPaymentProofs: [
            {
              url: url || null,
              uploadedAt: new Date(),
              amountCents: null,
              note: null,
            },
          ],
        });

        await setDoc(customRef, customPayload, { merge: true });

        await addAdminNotification({
          orderId: customId,
          userId: uid,
          cents: toC(customTotal),
          storagePath,
          url,
          kind: "initial",
        });

        // user notification
        try {
          await addDoc(
            collection(db, "users", uid, "notifications"),
            deepSanitizeForFirestore({
              userId: uid,
              type: "order_placed",
              customId,
              status: "processing",
              title: "Thanks! We’re reviewing your payment.",
              body: `We received your payment proof for your customization ${String(
                customId
              ).slice(0, 6)}.`,
              image: customItems?.[0]?.image ?? null,
              link: `/ordersummary?customId=${customId}`,
              createdAt: new Date(),
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
        navigate(`/ordersummary?customId=${customId}`, { replace: true });
        return;
      }

      /* ───── CATALOG CHECKOUT: normal orders/{orderId} doc ───── */

      const itemsLeanCatalog = buildItemsLean(items);
      const safeAddressCatalog = buildSafeAddress(pending?.shippingAddress);

      // Base order data
      const orderBase = {
        userId: uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items: itemsLeanCatalog,
        subtotal,
        shippingFee,
        total,
        shippingAddress: safeAddressCatalog,
        contactEmail: safeAddressCatalog?.email || null,
        note: "Created from Checkout",
        repairId: null,
        origin: "catalog",

        // Payments meta (neutral)
        paymentStatus: "pending",
        paymentProofPendingReview: true,
        paymentProofType: "deposit",
        paymentProofUpdatedAt: new Date(),

        assessmentStatus: "pending",
        assessedTotalCents: null,
        depositCents: 0,
        depositIntendedCents: toC(total),
        additionalPaymentsCents: 0,
        refundsCents: 0,
        requestedAdditionalPaymentCents: 0,
      };

      // Reserve an order ID (for storage path), but DO NOT write the doc yet
      const orderRef = doc(collection(db, "orders"));
      const orderId = orderRef.id;

      // Upload payment proof first – if this fails, no order will be created
      const { storagePath, url } = await uploadPaymentProofWithFallback(storage, {
        orderId,
        uid,
        file,
        kind: "initial",
      });

      // Now create the order with proof info included
      const orderPayload = deepSanitizeForFirestore({
        ...orderBase,
        paymentProofUrl: url || null, // legacy for Admin Orders image
        depositPaymentProofUrl: url || null,
        depositPaymentProofs: [
          {
            url: url || null,
            uploadedAt: new Date(),
            amountCents: null,
            note: null,
          },
        ],
      });

      await setDoc(orderRef, orderPayload);

      await addAdminNotification({
        orderId,
        userId: uid,
        cents: toC(total),
        storagePath,
        url,
        kind: "initial",
      });
      await addOrderEvent(orderId, {
        type: "payment_proof_submitted",
        amountCents: toC(total),
        storagePath,
        url: url || null,
      });

      // notify + cleanup
      try {
        await addDoc(
          collection(db, "users", uid, "notifications"),
          deepSanitizeForFirestore({
            userId: uid,
            type: "order_placed",
            orderId,
            status: "processing",
            title: "Thanks! We’re reviewing your payment.",
            body: `We received your payment proof for order ${String(orderId).slice(
              0,
              6
            )}.`,
            image: itemsLeanCatalog?.[0]?.image ?? null,
            link: `/ordersummary?orderId=${orderId}`,
            createdAt: new Date(),
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

      alert("Payment proof uploaded! Waiting for admin confirmation.");
      navigate(`/ordersummary?orderId=${orderId}`);
    } catch (e) {
      console.error(e);
      alert("Failed to submit payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Build a summary object for the right-hand OrderSummaryCard
  let summaryOrder;
  if (existingOrderId && existingOrder) {
    // If this is a repair doc without items, synthesize a single line item
    if (
      (existingOrder.origin === "repair" || existingOrder._kind === "repairs") &&
      (!Array.isArray(existingOrder.items) || existingOrder.items.length === 0)
    ) {
      const img =
        Array.isArray(existingOrder.images) && existingOrder.images.length
          ? existingOrder.images[0]
          : null;
      summaryOrder = {
        ...existingOrder,
        items: [
          {
            title:
              existingOrder.typeLabel ||
              existingOrder.productTitle ||
              "Repair Order",
            qty: 1,
            price:
              existingOrder.total != null
                ? Number(existingOrder.total)
                : 0,
            image: img,
          },
        ],
      };
    } else {
      summaryOrder = existingOrder;
    }
  } else {
    summaryOrder = { items, subtotal, shippingFee, total };
  }

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
                Waiting for admin to request an additional payment or finalize the
                assessment.
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
          <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
            {errMsg}
          </div>
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
          shippingFee={!existingOrderId ? shippingFee : undefined}
        />
      </div>
    </div>
  );
}
