// src/admin/data/auth/adminGuard.jsx
import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { auth } from "../../../firebase";

export default function AdminGuard({ children }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const db = getFirestore(auth.app);
    let stopUserDoc = null;

    const stopAuth = onAuthStateChanged(auth, (u) => {
      // not signed in → not allowed
      if (!u) {
        if (stopUserDoc) stopUserDoc();
        setAllowed(false);
        setReady(true);
        return;
      }

      // listen to users/{uid} and check role
      stopUserDoc = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          const role = snap.exists() ? snap.data()?.role : null;
          setAllowed(role === "admin");
          setReady(true);
        },
        () => {
          setAllowed(false);
          setReady(true);
        }
      );
    });

    return () => {
      stopAuth();
      if (stopUserDoc) stopUserDoc();
    };
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
