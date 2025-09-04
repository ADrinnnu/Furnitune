import React from "react";
import repsImg from "../assets/qual.jpg"

export default function Collections() {
  const products = [
    { id: 1, title: "Sofa", price: "₱199.99", img: "/img/sofa1.png", rating: 4.5, reviews: 322 },
    { id: 2, title: "Chair", price: "₱199.99", img: "/img/chair1.png", rating: 4.2, reviews: 322 },
    { id: 3, title: "Bed", price: "₱199.99", img: "/img/bed1.png", rating: 4.3, reviews: 322 },
    { id: 4, title: "Chair", price: "₱199.99", img: "/img/chair2.png", rating: 4.8, reviews: 322 },
    { id: 5, title: "Chair", price: "₱199.99", img: "/img/chair3.png", rating: 4.1, reviews: 322 },
    { id: 6, title: "Sofa", price: "₱199.99", img: "/img/sofa2.png", rating: 4.7, reviews: 322 },
    { id: 7, title: "Bed", price: "₱199.99", img: "/img/bed2.png", rating: 4.9, reviews: 322 },
    { id: 8, title: "Table", price: "₱199.99", img: "/img/table1.png", rating: 4.4, reviews: 322 },
    { id: 9, title: "Chair", price: "₱199.99", img: "/img/chair4.png", rating: 4.0, reviews: 322 },
    { id: 10, title: "Sofa", price: "₱199.99", img: "/img/sofa3.png", rating: 4.6, reviews: 322 },
  ];

  return (
    <div className="collection">
      <h1 className="collection-title">COMFORT CORE COLLECTION</h1>

      <img
        src={repsImg}
        alt="Comfort Core Banner"
        className="collection-banners"
      />

      <p className="collection-descriptions">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur non elit sed enim blandit iaculis.
        Suspendisse id lacinia leo. Duis gravida, magna sed euismod accumsan, libero elit pretium ipsum,
        vel congue elit erat eget metus. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur non elit sed enim blandit iaculis.
        Suspendisse id lacinia leo. Duis gravida, magna sed euismod accumsan, libero elit pretium ipsum,
        vel congue elit erat eget metus.   Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur non elit sed enim blandit iaculis.
        Suspendisse id lacinia leo. Duis gravida, magna sed euismod accumsan, libero elit pretium ipsum,
        vel congue elit erat eget metus.
      </p>

      <h2 className="section-heading">COMFORT CORE FURNITURES</h2>

      <div className="product-grids">
        {products.map((p) => (
          <div key={p.id} className="product-cards">
            <img src={p.img} alt={p.title} className="product-imgs" />
            <h3 className="product-titles">{p.title}</h3>
            <p className="product-prices">{p.price}</p>
            <div className="ratings">
              <span>{"⭐".repeat(Math.floor(p.rating))}</span>
              <p>({p.reviews} Reviews)</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}