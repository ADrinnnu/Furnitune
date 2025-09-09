// src/admin/AppAdmin.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./AdminLayout";
import AdminGuard from "./data/auth/adminGuard";

const Dashboard = React.lazy(() => import("./pages/Dashboard.jsx"));
const Products  = React.lazy(() => import("./pages/Products.jsx"));
const Orders    = React.lazy(() => import("./pages/Orders.jsx"));
const Users     = React.lazy(() => import("./pages/Users.jsx"));
const Shipments = React.lazy(() => import("./pages/Shipments.jsx"));
const Designs   = React.lazy(() => import("./pages/Designs.jsx"));
const AuditLog  = React.lazy(() => import("./pages/AuditLog.jsx"));

export default function AppAdmin() {
  return (
    <React.Suspense fallback={<div className="admin-gate">Loading…</div>}>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="products"  element={<Products />} />
            <Route path="orders"    element={<Orders />} />
            <Route path="users"     element={<Users />} />
            <Route path="shipments" element={<Shipments />} />
            <Route path="designs"   element={<Designs />} />
            <Route path="audit"     element={<AuditLog />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </React.Suspense>
  );
}
