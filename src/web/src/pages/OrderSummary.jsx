import React from "react";

export default function OrderSummary() {
  return (
    <div className="order-container">
      {/* Left: Order Summary */}
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>

        <div className="cart-section">
          <div className="cart-item">
            <img src="/images/sofa1.png" alt="Sofa" />
            <div className="cart-info">
              <p>Sofa</p>
              <span>Qty: 1</span>
            </div>
            <span className="price">₱199.99</span>
          </div>
        </div>

        <div className="delivery-section">
          <h4>DELIVERY ADDRESS</h4>
          <p>Mercy Eunice Valencia</p>
          <p>(+63) 910 3456 789</p>
          <p>Zone 123 456 890 Tarlac City</p>
        </div>

        <div className="summary-totals">
          <div><span>Subtotal</span><span>₱199.99</span></div>
          <div><span>Discount</span><span>-₱69.00</span></div>
          <div><span>Shipping & Handling</span><span>₱510.00</span></div>
          <div className="summary-total"><span>TOTAL</span><span>₱640.99</span></div>
        </div>
      </div>

      {/* Right: Order Details */}
      <div className="order-details">
        <h3>ORDER DETAILS</h3>

        {/* Progress Tracker */}
        <div className="progress-tracker">
          <div className="step completed">
            <span>📦</span>
            <p>PROCESSING ORDER</p>
          </div>
          <div className="step active">
            <span>✅</span>
            <p>FOR PACKAGING</p>
          </div>
          <div className="step">
            <span>🚚</span>
            <p>TO SHIP</p>
          </div>
          <div className="step">
            <span>📥</span>
            <p>TO RECEIVE</p>
          </div>
          <div className="step">
            <span>⭐</span>
            <p>TO RATE</p>
          </div>
        </div>

        <p className="tracker-note">
          Your order has been approved and is now in production. This
          checkout process will take approximately 2–3 days. We'll notify
          you once your package has been shipped for delivery.
        </p>

        {/* Support */}
        <div className="support-box">
          <h4>NEED ASSISTANCE?</h4>
          <p>💬 Live Chat: Offline now</p>
          <p>📞 Call: 123-325-312</p>
          <p>✉️ Email: Furnitune@jameyl.com</p>
        </div>
      </div>
    </div>
  );
}