// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCart } from "../state/CartContext";
import { auth } from "../firebase";
import { signOut, onIdTokenChanged } from "firebase/auth"; // removed onAuthStateChanged
import { useProductSearch } from "../hooks/useProductSearch";
import "../ProfileMenu.css";
import { useIsAdmin } from "../hooks/useIsAdmin";

// 🔔 Firestore bits for unread count
import { getFirestore, collection, query, where, onSnapshot } from "firebase/firestore";

const PRODUCT_ROUTE_PREFIX = "/product/";

export default function Navbar() {
  const { cartItems } = useCart();
  const count = (cartItems || []).reduce((sum, it) => sum + (it.qty || 0), 0);

  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const nav = useNavigate();

  // --- search state (logic only; UI unchanged) ---
  const { search } = useProductSearch();
  const [openSearch, setOpenSearch] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);

  // 🔔 unread notifications count
  const [unread, setUnread] = useState(0);

  // ✅ admin flag from Firestore users/{uid}.role
  const { isAdmin } = useIsAdmin();

  // single lightweight auth listener (no reload here)
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // subscribe to unread notifications for current user
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    const db = getFirestore(auth.app);
    const qRef = query(
      collection(db, "users", user.uid, "notifications"),
      where("read", "==", false)
    );
    const stop = onSnapshot(qRef, (snap) => setUnread(snap.size), () => setUnread(0));
    return stop;
  }, [user]);

  // close profile menu on outside click / ESC
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

  // close search popover on outside click / ESC
  useEffect(() => {
    function onDocClick(e) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target)) setOpenSearch(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpenSearch(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
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

  async function onSearchChange(e) {
    const v = e.target.value;
    setQ(v);
    setResults(await search(v));
  }

  function goToProduct(p) {
    nav(`${PRODUCT_ROUTE_PREFIX}${p.id}`);
    setOpenSearch(false);
    setQ("");
    setResults([]);
  }

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
          {/* 🔍 search icon + popover (keeps your icon row/position) */}
          <div
            ref={searchBoxRef}
            style={{ position: "relative", display: "inline-block" }}
          >
            <button
  className="icon-btn"
  aria-label="Search"
  title="Search"
  onClick={() => {
    setOpenSearch((s) => !s);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }}
  style={{ background: "transparent", border: 0, outline: "none", boxShadow: "none", padding: 0 }}
>
  🔍
</button>

            {openSearch && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 8,
                  width: 320,
                  background: "#f8f3e6",
                  borderRadius: 14,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                  zIndex: 50,
                }}
              >
                <input
                  ref={searchInputRef}
                  value={q}
                  onChange={onSearchChange}
                  placeholder="Search products…"
                  style={{
                    width: "100%",
                    display: "block",
                    border: "none",
                    outline: "none",
                    padding: "10px 12px",
                    background: "#f8f3e6",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(0,0,0,0.2)",
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                  }}
                />

                {q.length > 0 && (
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {results.length === 0 ? (
                      <div style={{ padding: "10px 12px", color: "#666", fontSize: 13 }}>
                        No matches
                      </div>
                    ) : (
                      results.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => goToProduct(p)}
                          title={p.name}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            background: "transparent",
                            border: 0,
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                          onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={{ width: 18, textAlign: "center", opacity: 0.8 }}>🔍</span>
                          <span style={{ fontSize: 14, color: "#222" }}>{p.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart with existing badge */}
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

          {/* 🔔 notifications with unread badge */}
          <div style={{ position: "relative", display: "inline-block" }}>
            <Link
              to="/notifications"
              className="icon-btn"
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
              title="Notifications"
            >
              🔔
            </Link>
            {unread > 0 && (
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
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>

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
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    decoding="async"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <span className="avatar-circle">{initials}</span>
                )}
              </button>

              {open && (
                <div className="profile-dropdown">
                  <div className="pd-head">ACCOUNT SETTINGS</div>

                  <Link to="/account" className="pd-item" onClick={() => setOpen(false)}>
                    <span className="pd-ic">👤</span>
                    <span>My Account</span>
                  </Link>

                  <Link to="/mypurchases" className="pd-item" onClick={() => setOpen(false)}>
                    <span className="pd-ic">🛒</span>
                    <span>My Purchases</span>
                  </Link>

                  {user && isAdmin && (
                    <Link to="/admin" className="pd-item" onClick={() => setOpen(false)}>
                      <span className="pd-ic">🛡️</span>
                      <span>Admin Dashboard</span>
                    </Link>
                  )}

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
          <NavLink to="/all"          className={activeClass} end>ALL FURNITURES</NavLink>
          <NavLink to="/best-sellers" className={activeClass}>BEST SELLERS</NavLink>
          <NavLink to="/new-designs"  className={activeClass}>NEW DESIGNS</NavLink>
          <NavLink to="/living-room"  className={activeClass}>LIVING ROOM</NavLink>
          <NavLink to="/bedroom"      className={activeClass}>BEDROOM</NavLink>
          <NavLink to="/dining-room"  className={activeClass}>DINING ROOM</NavLink>
          <NavLink to="/outdoor"      className={activeClass}>OUTDOOR</NavLink>
        </nav>

        <div className="actions">
          <NavLink to="/Customization" className={activeClass}>CUSTOMIZE</NavLink>
          <span>|</span>
          <NavLink to="/Repair" className={activeClass}>REPAIR</NavLink>
        </div>
      </div>
    </header>
  );
}
