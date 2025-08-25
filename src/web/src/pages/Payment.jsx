import React from "react";
import { useNavigate } from "react-router-dom";

export default function Payment() {
   const navigate = useNavigate();
  return (
    <div className="payment-container">
      {/* Left: Payment Form */}
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
          <button className="back-btn"onClick={() => navigate(-1)}>GO BACK</button>
          <button className="order-btn"onClick={() => navigate("/OrderSummary")}>PLACE ORDER</button>
        </div>
      </div>

      {/* Right: Order Summary */}
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>
        <div className="cart-item">
          <img src="/images/sofa1.png" alt="Product" />
          <div>
            <p>Sofa</p>
            <span>Qty: 1</span>
          </div>
          <span className="price">₱199.99</span>
        </div>

        <div className="summary-details">
          <div><span>Subtotal</span><span>₱199.99</span></div>
          <div><span>Discount</span><span>-₱69.00</span></div>
          <div><span>Shipping & Handling</span><span>₱510.00</span></div>
          <div className="summary-total"><span>TOTAL</span><span>₱640.99</span></div>
        </div>

        <div className="support-box">
          <h4>NEED ASSISTANCE?</h4>
          <p>💬 Live Chat: Online now</p>
          <p>📞 Call: 123-325-312</p>
          <p>✉️ Email: Furnitune@jameyl.com</p>
        </div>
      </div>
    </div>
  );
}