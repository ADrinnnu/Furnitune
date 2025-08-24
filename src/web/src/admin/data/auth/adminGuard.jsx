import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../../firebase";
import { isAdminEmail } from "./rbac";

export default function AdminGuard({ children }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setAllowed(!!u && isAdminEmail(u?.email || ""));
      setReady(true);
    });
    return () => off();
  }, []);

  if (!ready) return <div className="admin-gate">Loading…</div>;

  if (!allowed) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location }}     
      />
    );
  }

  return children || <Outlet />;
}
