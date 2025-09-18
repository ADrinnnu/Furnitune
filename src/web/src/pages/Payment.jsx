// src/pages/Payment.jsx
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { auth } from "../firebase";
import qrCodeImg from "../assets/payment.jpg";

export default function Payment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      alert("Please upload your payment screenshot.");
      return;
    }
    try {
      setUploading(true);
      const storage = getStorage(auth.app);
      const path = `payments/${orderId}/${file.name}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const db = getFirestore(auth.app);
      await updateDoc(doc(db, "orders", orderId), {
        paymentProofUrl: url,
        paymentStatus: "pending", 
      });

      alert("Payment proof uploaded! Waiting for admin confirmation.");
      navigate("/ordersummary?orderId=" + orderId);
    } catch (e) {
      console.error(e);
      alert("Failed to upload proof.");
    } finally {
      setUploading(false);
    }
  };

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
          onChange={(e) => setFile(e.target.files[0])}
        />

        <div className="form-actions">
          <button className="back-btn" onClick={() => navigate(-1)}>
            GO BACK
          </button>
          <button
            className="order-btn"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? "UPLOADING…" : "SUBMIT PAYMENT PROOF"}
          </button>
        </div>
      </div>

      {/* RIGHT: Order Summary */}
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>
        <OrderSummaryCard preferSelection />
      </div>
    </div>
  );
}
