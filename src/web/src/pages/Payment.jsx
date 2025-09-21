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
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { auth } from "../firebase";
import qrCodeImg from "../assets/payment.jpg";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import "../Payment.css";


const PENDING_KEY = "PENDING_CHECKOUT";

export default function Payment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId") || null;

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const db = useMemo(() => getFirestore(auth.app), []);

  // Load pending payload saved by Checkout
  const pending = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  // If nothing to pay for, bounce to cart
  useEffect(() => {
    if (!pending) navigate("/cart", { replace: true });
  }, [pending, navigate]);

  // Items for the summary (fallback to selection if needed)
  const items = useMemo(() => {
    if (pending?.items?.length) return pending.items;
    return getCheckoutItems();
  }, [pending]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0),
    [items]
  );
  const discount = pending?.discount ?? 69;
  const shippingFee = pending?.shippingFee ?? 510;
  const total = subtotal - discount + shippingFee;

  // ---- Leave protection (until proof submitted) ----
  useEffect(() => {
    let armed = true;
    const beforeUnload = (e) => {
      if (!armed || uploading) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onPopState = () => {
      if (!armed || uploading) return;
      const ok = window.confirm(
        "You have an in-progress payment. If you leave now, your order won’t be placed. Leave anyway?"
      );
      if (!ok) history.go(1);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      armed = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [uploading]);

  // Remove purchased items from cart after payment upload
  async function removeItemsFromCart(uid, purchased) {
    if (!uid || !Array.isArray(purchased) || purchased.length === 0) return;
    const wanted = new Set(
      purchased.map((it) => `${String(it.productId || it.id || "")}__${String(it.size || "")}`)
    );
    const snap = await getDocs(collection(db, "users", uid, "cart"));
    const deletions = [];
    snap.forEach((d) => {
      const c = d.data() || {};
      const key = `${String(c.productId || c.id || "")}__${String(c.size || "")}`;
      if (wanted.has(key)) deletions.push(deleteDoc(d.ref));
    });
    if (deletions.length) await Promise.all(deletions);
  }

  const handleUpload = async () => {
    if (!pending) {
      alert("Your session expired. Please checkout again.");
      navigate("/cart", { replace: true });
      return;
    }
    if (!file) {
      alert("Please upload your payment screenshot.");
      return;
    }

    setUploading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert("Please sign in again before paying.");
        navigate("/cart", { replace: true });
        return;
      }

      // 1) Create the order now (no order existed before Payment)
      const orderData = {
        userId: uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items,
        subtotal,
        discount,
        shippingFee,
        total,
        shippingAddress: pending?.shippingAddress || null,
        contactEmail: pending?.shippingAddress?.email || null,
        note: repairId ? `Created from Repair ${repairId}` : "Created from Checkout",
        repairId,
        paymentStatus: "pending",
      };
      const orderRef = await addDoc(collection(db, "orders"), orderData);

      // 2) Upload payment proof to Storage (under the new orderId)
      const storage = getStorage(auth.app);
      const path = `payments/${orderRef.id}/${Date.now()}_${file.name}`;
      const sRef = ref(storage, path);
      await uploadBytes(sRef, file);
      const proofUrl = await getDownloadURL(sRef);

      // 3) Save proof URL on the order
      await updateDoc(doc(db, "orders", orderRef.id), {
        paymentProofUrl: proofUrl,
        paymentStatus: "pending",
        paymentUpdatedAt: serverTimestamp(),
      });

      // 4) Notify the user (now that upload succeeded)
      try {
        await addDoc(collection(db, "users", uid, "notifications"), {
          userId: uid, // required by your rules
          type: repairId ? "repair_order_placed" : "order_placed",
          orderId: orderRef.id,
          ...(repairId ? { repairId } : {}),
          status: "processing",
          title: "Thanks! We’re reviewing your payment.",
          body: `We received your payment proof for order ${String(orderRef.id).slice(0, 6)}.`,
          image: (items?.[0]?.image || items?.[0]?.img) ?? null,
          link: `/ordersummary?orderId=${orderRef.id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      } catch (e) {
        console.warn("Notification create failed (rules?):", e);
      }

      // 5) Remove purchased items from cart
      try {
        await removeItemsFromCart(uid, items);
      } catch (e) {
        console.warn("Cart cleanup skipped/failed:", e);
      }

      // 6) Clear temp stores and go to Order Summary
      sessionStorage.removeItem(PENDING_KEY);
      try { clearCheckoutItems(); } catch {}
      alert("Payment proof uploaded! Waiting for admin confirmation.");
      navigate(`/ordersummary?orderId=${orderRef.id}`, { replace: true });
    } catch (e) {
      console.error(e);
      alert("Failed to submit payment proof. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!pending) return null;

  return (
    <div className="payment-container">
      {/* LEFT: Payment Form */}
      <div className="payment-form">
        <h3>PAYMENT VIA QR CODE</h3>
        <hr />
        <p>Please scan the QR code below and upload your proof of payment.</p>
        <img
          src={qrCodeImg}
          alt="Payment QR Code"
          style={{ maxWidth: "240px", margin: "12px 0" }}
        />

        <label>Upload Payment Proof*</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={uploading}
        />

        <div className="form-actions">
          <button
            className="back-btn"
            onClick={() => {
              const ok = window.confirm(
                "If you go back now, your order won’t be placed. Go back?"
              );
              if (ok) navigate(-1);
            }}
            disabled={uploading}
          >
            GO BACK
          </button>
          <button className="order-btn" onClick={handleUpload} disabled={uploading}>
            {uploading ? "UPLOADING…" : "SUBMIT PAYMENT PROOF"}
          </button>
        </div>
      </div>

      {/* RIGHT: Order Summary (driven by pending payload) */}
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>
        <OrderSummaryCard
          title="ORDER SUMMARY"
          showSupport
          showAddress={false}
          items={items}
          discount={discount}
          shippingFee={shippingFee}
          order={{ items, subtotal, discount, shippingFee, total }}
        />
      </div>
    </div>
  );
}
