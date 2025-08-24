// src/App.jsx
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
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
import Notification from "./pages/Notification.jsx";
import Checkout from "./pages/Checkout.jsx";
import Payment from "./pages/Payment.jsx";
import OrderSummary from "./pages/OrderSummary.jsx";
import MyPurchases from "./pages/MyPurchases.jsx";


export default function App() {
  const location = useLocation();

 
  const hideNavAndFooter = ["/login", "/create-account"].includes(location.pathname);

  return (
    <>
      {!hideNavAndFooter && <Navbar />}

      <Routes>
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
        <Route path="/login" element={<Login />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/repair" element={<Repair />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/account" element={<div>My Account (placeholder)</div>} />
        <Route path="/purchases" element={<div>My Purchase (placeholder)</div>} />
        <Route path="/notifications" element={<Notification />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/ordersummary" element={<OrderSummary />} />
        <Route path="" element={<MyPurchases />} />  
        


        {/* fallback */}
        <Route path="*" element={<Landing />} />
      </Routes>

      {!hideNavAndFooter && <Footer />}
    </>
  );
}
