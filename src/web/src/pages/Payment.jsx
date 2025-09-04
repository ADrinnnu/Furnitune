// src/pages/Payment.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard"; // ⬅️ same card used on Checkout

export default function Payment() {
  const navigate = useNavigate();

  return (
    <div className="payment-container">
      {/* LEFT: Payment Form */}
      <div className="payment-form">
        <h3>PAYMENT METHOD</h3>
        <hr />

        <label>Account Name*</label>
        <input type="text" placeholder="Enter your account name" required />

        <label>Account Number*</label>
        <input type="text" placeholder="+63 909 090 0909" required />

        <div className="payment-icons">
          <img src="/icons/visa.png" alt="Visa" />
          <img src="/icons/mastercard.png" alt="MasterCard" />
          <img src="/icons/paypal.png" alt="PayPal" />
          <img src="/icons/gcash.png" alt="GCash" />
        </div>

        <div className="form-actions">
          <button className="back-btn" onClick={() => navigate(-1)}>
            GO BACK
          </button>
          {/* NOTE: your route in App.jsx is lowercase `/ordersummary` */}
          <button className="order-btn" onClick={() => navigate("/ordersummary")}>
            PLACE ORDER
          </button>
        </div>
      </div>

      {/* RIGHT: Order Summary (re-using the same component) */}
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>

        {/* 
          The card reads the current "checkout selection" (set via setCheckoutItems) 
          and computes Subtotal/Total. If your component accepts a prop to force using
          the selection instead of looking up Firestore, keep `preferSelection`.
        */}
        <OrderSummaryCard preferSelection />
      </div>
    </div>
  );
}
