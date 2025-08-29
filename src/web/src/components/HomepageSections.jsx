import React from "react";
import { useNavigate } from "react-router-dom";

const features = [
  {
    title: "VISIT US!",
    description:
      "Visit our store and explore our collection in a space that sparks inspiration. Feel free to visit our physical store.",
    button: "Click to view location",
    image: "/images/map.png",
    path: "/VisitUs" // 👈 route for this button
  },
  {
    title: "CUSTOMIZE YOUR PIECE!",
    description:
      "Bring your vision to life with our customization feature—make your own piece in your own way.",
    button: "Click to start customizing your furniture",
    image: "/images/customize.png",
    path: "/Customization" 
  },
  {
    title: "ASK FURNITURE SUGGESTION!",
    description:
      "Discover furniture that fits your style with our smart recommendation system.",
    button: "Take a short quiz to get a suggestion",
    image: "/images/recommendation.png",
    path: "" 
  }
];

const reviews = [
  {
    title: "DESIGN",
    quote:
      "Solid. Maayos-kalfa ang gandang-ganda ng design that fits my room. Very modern, subtle na warm design na perfectly nadala nila.",
    name: "Austria, JC | San Miguel, Tarlac",
    image: "/images/review-design.png"
  },
  {
    title: "QUALITY",
    quote:
      "The quality is so good. I love their furniture so much. Every time the quality, the materials, every piece is a masterpiece.",
    name: "Santos, Rhey | Concepcion, Tarlac",
    image: "/images/review-quality.png"
  },
  {
    title: "DELIVERY",
    quote:
      "The delivery is on time and under bills. Even with a big package, men, bali-bali and energetic sila. Paulyn service talaga and that’s what makes it good!",
    name: "Valencia, Enrica | Malacampa, Tarlac City",
    image: "/images/review-delivery.png"
  },
  {
    title: "CUSTOMER SERVICE",
    quote:
      "Ang bilis ng reply nila and super bait nila sa queries. May guiding assistant, chatbot sa recommendation system. Nakakatulong siya so I find a furniture that fits sa taste ko.",
    name: "Villanueva, Aldrin | Paniqui, Tarlac",
    image: "/images/review-customer.png"
  }
];

export default function HomepageSections() {
  const navigate = useNavigate(); 

  return (
    <div className="homepage">
      <section className="features-section">
        <h2>
          EVERYTHING <span className="thin-text">YOU NEED IS AT</span>{" "}
          <span className="highlight">FURNITUNE!</span>
        </h2>
        <div className="cards-container">
          {features.map((f, index) => (
            <div key={index} className="feature-card">
              <div
                className="feature-image"
                style={{ backgroundImage: `url(${f.image})` }}
              ></div>
              <div className="feature-content">
                <h3>{f.title}</h3>
                <p>{f.description}</p>

                {/* Button navigates to the page specified in f.path */}
                <button onClick={() => navigate(f.path)}>{f.button}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="reviews-section">
        <h3 className="reviews-heading">
          THE REVIEWS? WELL... <br />
          <span className="stars">★★★★★</span>
        </h3>
        <div className="cards-container">
          {reviews.map((r, i) => (
            <div key={i} className="review-card">
              <div
                className="review-image"
                style={{ backgroundImage: `url(${r.image})` }}
              ></div>
              <div className="review-content">
                <h4>{r.title}</h4>
                <p className="quote">“{r.quote}”</p>
                <p className="reviewer">{r.name}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="footer-note">
          Don’t just take our word for it—our customers say it all. Experience
          the quality today! So, what are you waiting for? Shop now!
        </p>
      </section>
    </div>
  );
}
