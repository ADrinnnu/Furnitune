import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import Landing from "./pages/Landing.jsx";
import AllFurnitures from "./pages/AllFurnitures.jsx";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/all-furnitures" element={<AllFurnitures />} />
        {/* Fallback so the app never renders blank if the path is wrong */}
        <Route path="*" element={<Landing />} />
      </Routes>
      <Footer />
    </>
  );
}
