// src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import Landing from "./pages/Landing.jsx";
import AllFurnitures from "./pages/AllFurnitures.jsx";
import BestSellers from "./pages/BestSellers.jsx";
import NewDesigns from "./pages/NewDesigns.jsx";
import LivingRoom from "./pages/LivingRoom.jsx";
import Bedroom from "./pages/Bedroom.jsx";
import DiningRoom from "./pages/DiningRoom.jsx";
import Outdoor from "./pages/Outdoor.jsx";
import CartPage from "./pages/CartPage.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Login from "./pages/Login.jsx";
import CreateAccount from "./pages/CreateAccount.jsx";
import Repair from "./pages/Repair.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Account from "./pages/Account.jsx";
import AppAdmin from "./admin/AppAdmin";

// Auth routes you want to treat specially (no public navbar/footer)
const AUTH_PREFIXES = ["/login", "/create-account", "/verify-email", "/forgot-password"];

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
import Notification from "./pages/Notification.jsx";
import Checkout from "./pages/Checkout.jsx";
import Payment from "./pages/Payment.jsx";
import OrderSummary from "./pages/OrderSummary.jsx";
import MyPurchases from "./pages/MyPurchases.jsx";


export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // Auth state + verify-email redirect (but don't hijack admin/auth pages)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);

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
        {/* Public pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/all-furnitures" element={<AllFurnitures />} />
        <Route path="/best-sellers" element={<BestSellers />} />
        <Route path="/new-designs" element={<NewDesigns />} />
        <Route path="/living-room" element={<LivingRoom />} />
        <Route path="/bed-room" element={<Bedroom />} />
        <Route path="/dining-room" element={<DiningRoom />} />
        <Route path="/out-door" element={<Outdoor />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/Repair" element={<Repair />} />
        <Route path="/Customization" element={<Customization />} />


        {/* Auth pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account" element={<div>My Account (placeholder)</div>} />
        <Route path="/purchases" element={<div>My Purchase (placeholder)</div>} />
        <Route path="/notifications" element={<Notification />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/ordersummary" element={<OrderSummary />} />
<<<<<<< HEAD
        <Route path="/purchases" element={<MyPurchases />} />  


        {/* Admin app (has its own layout; no public navbar/footer) */}
        <Route path="/admin/*" element={<AppAdmin />} />
      </Routes>

      {!hideNavAndFooter && <Footer />}
    </>
  );
}
