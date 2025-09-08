import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

export function useIsAdmin() {
  const [state, setState] = useState({
    loading: true,
    isAdmin: false,
    user: null,
  });

  useEffect(() => {
    const stopAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setState({ loading: false, isAdmin: false, user: null });
        return;
      }
      const db = getFirestore(auth.app);
      const ref = doc(db, "users", u.uid);
      const stopDoc = onSnapshot(
        ref,
        (snap) => {
          const role = snap.exists() ? snap.data()?.role : null;
          setState({ loading: false, isAdmin: role === "admin", user: u });
        },
        () => setState({ loading: false, isAdmin: false, user: u })
      );
      return stopDoc;
    });
    return () => stopAuth();
  }, []);

  return state; // { loading, isAdmin, user }
}
