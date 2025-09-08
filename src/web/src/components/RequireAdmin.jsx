import React from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "../hooks/useIsAdmin";

export default function RequireAdmin({ children }) {
  const { loading, isAdmin } = useIsAdmin();
  if (loading) return null; // or a tiny spinner
  return isAdmin ? children : <Navigate to="/" replace />;
}
