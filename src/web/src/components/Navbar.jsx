// src/components/Navbar.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useCart } from "../state/CartContext";   // 👈 import context

export default function Navbar() {
  const { items } = useCart(); // 👈 get cart items
  const count = items.reduce((sum, it) => sum + it.qty, 0); // total qty in cart

  return (
    <header className="nav">
      <div className="top-bar container">
        <Link to="/" className="brand" aria-label="Go to homepage">
          FURNITUNE
        </Link>
        <div className="icons">
          <span>🔍</span>
          <span>♡</span>

          {/* Cart with badge */}
          <div style={{ position: "relative", display: "inline-block" }}>
            <Link to="/cart" className="icon-btn" aria-label="Open cart">
              🛒
            </Link>
            {count > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -10,
                  background: "crimson",
                  color: "#fff",
                  borderRadius: "50%",
                  fontSize: "0.7rem",
                  padding: "2px 6px",
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            )}
          </div>

          <span>🔔</span>
          <Link to="/login" className="icon-btn" aria-label="Login or Profile">
            👤
          </Link>
        </div>
      </div>

      <div className="menu-bar container">
        <nav className="categories">
          <Link to="/all-furnitures">ALL FURNITURES</Link>
          <a href="/best-sellers">BEST SELLERS</a>
          <a href="/new-designs">NEW DESIGNS</a>
          <a href="/living-room">LIVING ROOM</a>
          <a href="/bed-room">BEDROOM</a>
          <a href="/dining-room">DINING ROOM</a>
          <a href="/out-door">OUTDOOR</a>
        </nav>
        <div className="actions">
          <a href="/customize">CUSTOMIZE</a>
          <span>|</span>
          <a href="/repair">REPAIR</a>
        </div>
      </div>
    </header>
  );
}
