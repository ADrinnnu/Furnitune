import { useEffect, useMemo, useState } from "react";
import { provider } from "../data";
import React from "react";


export default function Dashboard() {
  const [designs, setDesigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, p, o, s] = await Promise.all([
          provider.listDesigns().catch(() => []),
          provider.listProducts().catch(() => []),
          provider.listOrders().catch(() => []),
          provider.listShipments().catch(() => []),
        ]);
        if (!alive) return;
        setDesigns(d || []);
        setProducts(p || []);
        setOrders(o || []);
        setShipments(s || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const kpis = useMemo(() => {
    const totalSales = orders.reduce((sum, o) => sum + (o.totalCents || 0), 0);
    const shipped = shipments.filter((s) =>
      ["shipped", "in_transit", "out_for_delivery", "delivered"].includes(s.status)
    ).length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;

    return {
      designs: designs.length,
      products: products.length,
      orders: orders.length,
      shipments: shipments.length,
      shipped,
      delivered,
      revenue: totalSales / 100, // assuming cents
    };
  }, [designs, products, orders, shipments]);

  return (
    <div className="admin-root-page">
      <h2>Dashboard</h2>

      {/* KPIs */}
      <div className="admin-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KPI label="Designs" value={kpis.designs} />
        <KPI label="Products" value={kpis.products} />
        <KPI label="Orders" value={kpis.orders} />
        <KPI label="Shipments" value={kpis.shipments} />
        <KPI label="Shipped+" value={kpis.shipped} />
        <KPI label="Delivered" value={kpis.delivered} />
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Recent Products</h3>
          {loading ? (
            <div>Loading…</div>
          ) : products.length === 0 ? (
            <div>No products yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{(p.priceCents / 100).toFixed(2)} {p.currency || "USD"}</td>
                    <td>{p.stock}</td>
                    <td>{p.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>Recent Shipments</h3>
          {loading ? (
            <div>Loading…</div>
          ) : shipments.length === 0 ? (
            <div>No shipments yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {shipments.slice(0, 8).map((s) => (
                  <tr key={s.id}>
                    <td>#{String(s.id).slice(0, 6)}</td>
                    <td>{s.status}</td>
                    <td>{s.orderId || "—"}</td>
                    <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Revenue (Total)</h3>
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          {kpis.revenue.toLocaleString(undefined, { style: "currency", currency: "USD" })}
        </div>
        <div className="muted small">Based on order totals (cumulative)</div>
      </div>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div className="admin-card kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
