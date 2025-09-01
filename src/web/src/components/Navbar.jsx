// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import "../ProfileMenu.css";

export default function Navbar() {
  const { cartItems } = useCart();
  const count = (cartItems || []).reduce((sum, it) => sum + (it.qty || 0), 0);

  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

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
      nav("/");
    } catch (e) {
      console.error(e);
    }
  };

  const initials =
    (
      user?.displayName?.trim().split(/\s+/).map((n) => n[0]).join("") ||
      user?.email?.[0] ||
      "U"
    )
      .toUpperCase()
      .slice(0, 2);

  const activeClass = ({ isActive }) => (isActive ? "active" : undefined);

  return (
    <header className="nav">
      <div className="top-bar container">
        <Link to="/" className="brand" aria-label="Go to homepage">
          FURNITUNE
        </Link>

        <div className="icons">
          <span>🔍</span>

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

          <Link to="/notifications" className="icon-btn" aria-label="Notification">
            🔔
          </Link>

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

                  {/* Use your real purchases route; you have /mypurchases in App.jsx */}
                  <Link to="/mypurchases" className="pd-item" onClick={() => setOpen(false)}>
                    <span className="pd-ic">🛒</span>
                    <span>My Purchases</span>
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
          {/* ✅ use NavLink + correct paths that exist in App.jsx */}
          <NavLink to="/all"          className={activeClass} end>ALL FURNITURES</NavLink>
          <NavLink to="/best-sellers" className={activeClass}>BEST SELLERS</NavLink>
          <NavLink to="/new-designs"  className={activeClass}>NEW DESIGNS</NavLink>
          <NavLink to="/living-room"  className={activeClass}>LIVING ROOM</NavLink>
          <NavLink to="/bedroom"      className={activeClass}>BEDROOM</NavLink>
          <NavLink to="/dining-room"  className={activeClass}>DINING ROOM</NavLink>
          <NavLink to="/outdoor"      className={activeClass}>OUTDOOR</NavLink>
        </nav>

        <div className="actions">
          {/* match your defined routes' casing */}
          <NavLink to="/Customization" className={activeClass}>CUSTOMIZE</NavLink>
          <span>|</span>
          <NavLink to="/Repair" className={activeClass}>REPAIR</NavLink>
        </div>
      </div>
    </header>
  );
}
