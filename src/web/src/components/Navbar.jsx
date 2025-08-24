// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import "../ProfileMenu.css"; // styles just below

export default function Navbar() {
  const { items } = useCart();
  const count = items.reduce((sum, it) => sum + it.qty, 0);

  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const nav = useNavigate();

  // Watch auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Close on outside click / ESC
  useEffect(() => {
    const click = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setOpen(false);
      nav("/"); // back to home
    } catch (e) {
      console.error(e);
    }
  };

  // Helper for a small round avatar with initials
  const initials =
    (user?.displayName?.trim().split(/\s+/).map((n) => n[0]).join("") ||
      user?.email?.[0] ||
      "U"
    ).toUpperCase().slice(0, 2);

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

          {/* Profile / Login */}
          {!user ? (
            <Link to="/login" className="icon-btn" aria-label="Login or Profile">
              👤
            </Link>
          ) : (
            <div className="profile-hub" ref={menuRef}>
              <button
                className="avatar-btn"
                aria-label="Open profile menu"
                onClick={() => setOpen((s) => !s)}
              >
                <span className="avatar-circle">{initials}</span>
              </button>

              {open && (
                <div className="profile-dropdown">
                  <div className="pd-head">ACCOUNT SETTINGS</div>

                  <Link to="/account" className="pd-item" onClick={() => setOpen(false)}>
                    <span className="pd-ic">👤</span>
                    <span>My Account</span>
                  </Link>

                  <Link to="/orders" className="pd-item" onClick={() => setOpen(false)}>
                    <span className="pd-ic">🛒</span>
                    <span>My Purchase</span>
                  </Link>

                  <button className="pd-item danger" onClick={handleLogout}>
                    <span className="pd-ic">🚪</span>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
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
