import React from "react";


export default function Notification() {
  const notifications = [
    {
      id: 1,
      img: "/images/sofa1.png",
      title: "Your order has been confirmed!",
      desc: 'Your order "Sofa (3s)" has been confirmed and is now being prepared. We’ll keep you updated once it’s ready for delivery. Thank you for choosing us!'
    },
    {
      id: 2,
      img: "/images/sofa2.png",
      title: "Your order has been confirmed!",
      desc: 'Your order "Customized Order #111" has been confirmed and is now being prepared. We’ll keep you updated once it’s ready for delivery. Thank you for choosing us!'
    },
    {
      id: 3,
      img: "/images/sofa3.png",
      title: "Your order has been confirmed!",
      desc: 'Your order "Repair Request #1" has been confirmed and is now being prepared. We’ll keep you updated once it’s ready for delivery. Thank you for choosing us!'
    },
    // duplicate for demo...
  ];

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>NOTIFICATIONS</h2>
        <div className="filter-buttons">
          <button className="active">ALL</button>
          <button>UNREAD</button>
        </div>
      </div>

      <div className="notifications-list">
        {notifications.map((n) => (
          <div className="notification-item" key={n.id}>
            <img src={n.img} alt="Product" />
            <div className="notification-text">
              <h3>{n.title}</h3>
              <p>{n.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="notifications-footer">
        <button>SEE PREVIOUS NOTIFICATIONS</button>
      </div>
    </div>
  );
}