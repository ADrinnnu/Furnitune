// src/admin/AdminLayout.jsx
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./admin.css"; 

export default function AdminLayout() {
  const nav = useNavigate();
  const linkClass = ({ isActive }) => (isActive ? "active" : "");

  return (
    <div className="admin-root">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand" style={{ marginBottom: 12 }}>
          {/* Button avoids full page reloads */}
          <button className="admin-back" onClick={() => nav("/admin")}>
            FURNITUNE Admin
          </button>
        </div>

        {/* Use ABSOLUTE paths so we don't bounce through the index route */}
        <nav>
          <NavLink end to="/admin" className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/products" className={linkClass}>
            Products
          </NavLink>
          <NavLink to="/admin/orders" className={linkClass}>
            Orders
          </NavLink>
          <NavLink to="/admin/shipments" className={linkClass}>
            Shipments
          </NavLink>
          <NavLink to="/admin/users" className={linkClass}>
            Users
          </NavLink>
          <NavLink to="/admin/audit" className={linkClass}>
            Audit Log
          </NavLink>
        </nav>

        <button className="admin-back" onClick={() => nav("/")}>
          Back to site
        </button>
      </aside>

      {/* Main outlet */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
