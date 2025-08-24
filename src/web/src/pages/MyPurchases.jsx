import React from "react";


export default function MyPurchases() {
  return (
    <div className="orders-container">
      {/* Tabs / Filters */}
      <div className="order-tabs">
        <button className="active">ALL</button>
        <button>PROCESSING ORDER</button>
        <button>PREPARING</button>
        <button>TO SHIP</button>
        <button>TO RECEIVE</button>
        <button>COMPLETED</button>
        <button>RETURN/REFUND</button>
      </div>

      {/* Order List */}
      <div className="order-card">
        <div className="order-header">
          <span>🪑 FURNITURE</span>
        </div>
        <div className="order-body">
          <img src="/images/sofa1.png" alt="Sofa" />
          <div className="order-info">
            <p className="order-title">Sofa</p>
            <p className="order-seller">Vendor: Santos</p>
            <p className="order-qty">x1</p>
          </div>
          <div className="order-price">
            <p>₱640.00</p>
          </div>
        </div>
        <div className="order-footer">
          <p className="order-total">Order Total: ₱640.00</p>
          <div className="order-actions">
            <button className="pending">PENDING</button>
            <button className="contact">CONTACT SELLER</button>
            <button className="cancel">CANCEL ORDER</button>
          </div>
        </div>
      </div>

      <div className="order-card">
        <div className="order-header">
          <span>🪑 FURNITURE</span>
        </div>
        <div className="order-body">
          <img src="/images/table1.png" alt="Customize Order" />
          <div className="order-info">
            <p className="order-title">Customize Order #1</p>
            <p className="order-seller">Vendor: Teamate</p>
            <p className="order-qty">x1</p>
          </div>
          <div className="order-price">
            <p>₱2,941.00</p>
          </div>
        </div>
        <div className="order-footer">
          <p className="order-total">Order Total: ₱2,941.00</p>
          <div className="order-actions">
            <button className="pending">PENDING</button>
            <button className="contact">CONTACT SELLER</button>
            <button className="cancel">CANCEL ORDER</button>
          </div>
        </div>
      </div>

      <div className="order-card">
        <div className="order-header">
          <span>🪑 FURNITURE</span>
        </div>
        <div className="order-body">
          <img src="/images/repair.png" alt="Repair Request" />
          <div className="order-info">
            <p className="order-title">Repair Request #1</p>
            <p className="order-seller">Vendor: Teamate</p>
            <p className="order-qty">x1</p>
          </div>
          <div className="order-price">
            <p>₱1,941.00</p>
          </div>
        </div>
        <div className="order-footer">
          <p className="order-total">Order Total: ₱1,941.00</p>
          <div className="order-actions">
            <button className="pending">PENDING</button>
            <button className="contact">CONTACT SELLER</button>
            <button className="cancel">CANCEL ORDER</button>
          </div>
        </div>
      </div>
    </div>
  );
}