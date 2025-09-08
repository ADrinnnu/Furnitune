// src/App.jsx
import React, { useEffect, useState } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

/* Layout */
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import FloatingRobot from "./components/FloatingRobot";

/* Public pages */
import Landing from "./pages/Landing.jsx";
import AllFurnitures from "./pages/AllFurnitures.jsx";
import CartPage from "./pages/CartPage.jsx";
import Repair from "./pages/Repair.jsx";
import Customization from "./pages/Customization.jsx";
import ProductDetail from "./pages/ProductDetail";

/* Auth pages */
import Login from "./pages/Login.jsx";
import CreateAccount from "./pages/CreateAccount.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Account from "./pages/Account.jsx";
import { ensureUserDoc } from "./utils/ensureUserDoc";

/* Other */
import AppAdmin from "./admin/AppAdmin";
import Notification from "./pages/Notification.jsx";
import Checkout from "./pages/Checkout.jsx";
import Payment from "./pages/Payment.jsx";
import OrderSummary from "./pages/OrderSummary.jsx";
import MyPurchases from "./pages/MyPurchases.jsx";
import VisitUs from "./pages/VisitUs.jsx";
import AboutUs from "./pages/AboutUs.jsx";
import Collections from "./pages/Collections.jsx";

/* Optional tabbed hub */
import FurnitureHub from "./pages/FurnitureHub";

/** Routes that should NOT show the public navbar/footer */
const AUTH_PREFIXES = [
  "/login",
  "/create-account",
  "/verify-email",
  "/forgot-password",
];

function HistoryTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isAdmin = pathname.startsWith("/admin");
    const isAuth = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isAdmin && !isAuth) {
      sessionStorage.setItem("lastNonAuthPath", pathname);
    }
  }, [pathname]);
  return null;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // Auth state + verify-email redirect (skip admin/auth pages)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);

      // 🔥 Auto-create/refresh users/{uid} profile doc
      if (u) {
        // no await needed; safe to run in background
        ensureUserDoc(u).catch(console.error);
      }

      const path = location.pathname;
      const isAdmin = path.startsWith("/admin");
      const isAuth = AUTH_PREFIXES.some((p) => path.startsWith(p));

      if (u && !u.emailVerified && !isAdmin && !isAuth && path !== "/verify-email") {
        navigate("/verify-email", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate, location.pathname]);

  const path = location.pathname;
  const isAdmin = path.startsWith("/admin");
  const isAuthPage = AUTH_PREFIXES.some((p) => path.startsWith(p));
  const hideNavAndFooter = isAdmin || isAuthPage;

  return (
    <>
      {!hideNavAndFooter && <Navbar />}
      <HistoryTracker />

      <Routes>
        {/* Home */}
        <Route path="/" element={<Landing />} />

        {/* Category pages */}
        <Route path="/all"          element={<AllFurnitures pageTitle="ALL FURNITURES" />} />
        <Route path="/best-sellers" element={<AllFurnitures collection="best-sellers" pageTitle="BEST SELLERS" />} />
        <Route path="/new-designs"  element={<AllFurnitures collection="new-designs"  pageTitle="NEW DESIGNS"  />} />
        <Route path="/living-room"  element={<AllFurnitures room="living-room" pageTitle="LIVING ROOM" />} />
        <Route path="/bedroom"      element={<AllFurnitures room="bedroom"     pageTitle="BEDROOM"     />} />
        <Route path="/dining-room"  element={<AllFurnitures room="dining-room" pageTitle="DINING ROOM" />} />
        <Route path="/outdoor"      element={<AllFurnitures room="outdoor"     pageTitle="OUTDOOR"     />} />

        {/* Old path redirect */}
        <Route path="/all-furnitures" element={<Navigate to="/all" replace />} />

        {/* Product detail & cart */}
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<CartPage />} />

        {/* Other public pages */}
        <Route path="/Repair" element={<Repair />} />
        <Route path="/Customization" element={<Customization />} />
        <Route path="/furniture" element={<FurnitureHub />} />
        <Route path="/chatbot" element={<div>ChatBot coming soon</div>} />

        {/* Auth pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/account" element={<Account />} />

        {/* Misc */}
        <Route path="/notifications" element={<Notification />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/ordersummary" element={<OrderSummary />} />
        <Route path="/mypurchases" element={<MyPurchases />} />
        <Route path="/visitus" element={<VisitUs />} />
        <Route path="/aboutus" element={<AboutUs />} />
        <Route path="/collections" element={<Collections />} />

        {/* Admin app */}
        <Route path="/admin/*" element={<AppAdmin />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/all" replace />} />
      </Routes>

+      {!isAuthPage && <FloatingRobot />}
      {!hideNavAndFooter && <Footer />}
    </>
  );
}
