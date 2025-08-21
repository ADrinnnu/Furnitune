import React from "react";
import { Routes, Route } from "react-router-dom";
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
import Repair from "./pages/Repair.jsx";
export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/all-furnitures" element={<AllFurnitures />} />
        <Route path="/best-sellers" element={<BestSellers />} />
        <Route path="/new-designs" element={<NewDesigns />} />
        <Route path="/living-room" element={<LivingRoom />} />
        <Route path="/bed-room" element={<Bedroom />} />
        <Route path="/dining-room" element={<DiningRoom/>} />
        <Route path="/out-door" element={<Outdoor/>} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/repair" element={<Repair />} />
        {/* Fallback so the app never renders blank if the path is wrong */}
        <Route path="*" element={<Landing />} />
      </Routes>
      <Footer />
    </>
  );
}
