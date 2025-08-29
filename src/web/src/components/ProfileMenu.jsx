import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import "../ProfileMenu.css";

export default function ProfileMenu({ onClose }) {
  const nav = useNavigate();
  const user = auth.currentUser;

  const handleLogout = async () => {
    await signOut(auth);
    onClose?.();
    nav("/login");
  };

  return (
    <div className="profile-menu" role="menu" aria-label="Account settings">
      <div className="pm-header">ACCOUNT SETTINGS</div>

      <Link to="/account" className="pm-item" onClick={onClose}>
        <span className="pm-ico">{/* person */}</span>
        <span>My Account</span>
      </Link>

      <Link to="/mypurchases" className="pm-item" onClick={onClose}>
        <span className="pm-ico pm-cart" />
        <span>My Purchase</span>
      </Link>

      <button type="button" className="pm-item pm-logout" onClick={handleLogout}>
        <span className="pm-ico pm-out" />
        <span>Logout</span>
      </button>
    </div>
  );
}
