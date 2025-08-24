import React from "react";
import { useNavigate } from "react-router-dom";

export default function Checkout() {
   const navigate = useNavigate();
  return (
    <div className="checkout-container">
      {/* Left: Form Section */}
      <div className="checkout-form">
        <h3>EMAIL</h3>
        <input type="email" placeholder="*Email" required />
        <label className="checkbox">
          <input type="checkbox" /> Sign up for news & special offers?
        </label>

        <h3>SHIPPING ADDRESS</h3>
        <div className="form-grid">
          <input type="text" placeholder="*First Name" required />
          <input type="text" placeholder="*Last Name" required />
        </div>
        <input type="text" placeholder="*Street Address" required />
        <input type="text" placeholder="Apt/Suite # (Optional)" />
        <div className="form-grid">
          <input type="text" placeholder="*City" required />
          <input type="text" placeholder="*State" required />
          <input type="text" placeholder="*Zip/Postal Code" required />
        </div>
        <input type="text" placeholder="*Phone Number" required />

        <div className="form-actions">
          <button className="cancel-btn"onClick={() => navigate("/ProductDetail")}>CANCEL</button>
          <button className="pay-btn" onClick={() => navigate("/Payment")}>CONTINUE TO PAY</button>
        </div>
      </div>

      {/* Right: Order Summary */}
      <div className="checkout-summary">
        <h3>ORDER SUMMARY</h3>
        <div className="cart-item">
          <img src="/images/sofa1.png" alt="Product" />
          <div>
            <p>Repair Request #1</p>
            <span>TBD</span>
          </div>
        </div>

        <div className="summary-details">
          <div><span>Subtotal</span><span>TBD</span></div>
          <div><span>Discount</span><span>-₱69.00</span></div>
          <div><span>Shipping & Handling</span><span>₱510.00</span></div>
          <div className="summary-total"><span>TOTAL</span><span>TBD</span></div>
        </div>

        <div className="support-box">
          <h4>NEED ASSISTANCE?</h4>
          <p>💬 Live Chat: Offline now</p>
          <p>📞 Call: 123-325-312</p>
          <p>✉️ Email: Furnitune@jserwj.com</p>
        </div>
      </div>
    </div>
  );
}