import { useEffect, useMemo, useState } from "react";
import { provider } from "../data";
import React from "react";
import { auth } from "../../firebase";
import {
  getFirestore,
  collection,
  onSnapshot,
} from "firebase/firestore";

/* =============================
   Config
   ============================= */
const DISPLAY_CURRENCY = "PHP";
const COUNT_ONLY_PAID = true; // only count rows with paymentStatus === "paid"

/* =============================
   Firestore-aware date utils
   ============================= */
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function normalizeDay(ts) {
  if (!ts) return null;
  let d = null;
  if (typeof ts?.toDate === "function") d = ts.toDate();
  else if (typeof ts?.seconds === "number") d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
  if (isNaN(d?.getTime?.())) return null;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return day.toISOString().slice(0, 10); // YYYY-MM-DD
}
function pickDate(o, pref = []) {
  for (const k of pref) {
    const v = o?.[k];
    if (v) return v;
  }
  return null;
}

/* =============================
   Normalization helpers
   ============================= */
// total in cents from any schema shape
function centsFromAny(o) {
  if (!o) return 0;
  if (typeof o.assessedTotalCents === "number") return Math.max(0, o.assessedTotalCents);
  if (typeof o.totalCents === "number") return Math.max(0, o.totalCents);
  if (typeof o.amountCents === "number") return Math.max(0, o.amountCents);
  if (typeof o.unitPrice === "number") return Math.max(0, Math.round(Number(o.unitPrice) * 100));
  const total = Number(o.total);
  if (Number.isFinite(total)) return Math.max(0, Math.round(total * 100));
  return 0;
}

// refunds in cents
function refundCentsFromAny(o) {
  let r = 0;
  if (typeof o?.refundCents === "number") r += o.refundCents;
  if (typeof o?.refundedCents === "number") r += o.refundedCents;
  if (Array.isArray(o?.refunds)) {
    r += o.refunds.reduce((s, x) => s + (x?.amountCents ?? x?.cents ?? 0), 0);
  }
  const status = String(o?.status || "").toLowerCase();
  const payStatus = String(o?.paymentStatus || "").toLowerCase();
  const isCancelled = status === "cancelled" || status === "canceled";
  const isRefundFlow = status === "refund";
  const isRefunded = payStatus === "refunded" || o?.isRefunded;
  if (r === 0 && (isCancelled || isRefundFlow || isRefunded)) r = centsFromAny(o);
  // cap to total
  const cap = centsFromAny(o);
  return Math.max(0, Math.min(r, cap));
}

// Normalize a row (order/repair/custom) into a minimal sale shape
function normalizeSale(row, kind) {
  return {
    id: row?.id,
    kind, // 'order' | 'repair' | 'custom'
    paymentStatus: String(row?.paymentStatus || "pending").toLowerCase(),
    status: String(row?.status || "").toLowerCase(),
    totalCents: centsFromAny(row),
    refundedCents: refundCentsFromAny(row),
    paidAt: row?.paidAt,
    createdAt: row?.createdAt,
    updatedAt: row?.updatedAt,
    refundedAt: row?.refundedAt,
    cancelledAt: row?.cancelledAt || row?.canceledAt,
    statusUpdatedAt: row?.statusUpdatedAt,
    // link hints
    repairId: row?.repairId,
    customId: row?.customId || row?.id,
    origin: row?.origin,
  };
}

/* =============================
   Build revenue from merged sales
   ============================= */
function buildNetRevenueSeriesFromSales(sales) {
  const grossByDay = new Map();
  const refundByDay = new Map();

  for (const s of sales || []) {
    const isPaid = s.paymentStatus === "paid";
    if (!COUNT_ONLY_PAID || isPaid) {
      if (s.totalCents > 0) {
        const k = normalizeDay(pickDate(s, ["paidAt", "createdAt", "updatedAt"]));
        if (k) grossByDay.set(k, (grossByDay.get(k) || 0) + s.totalCents);
      }
    }
    if (s.refundedCents > 0) {
      const k = normalizeDay(pickDate(s, ["refundedAt", "cancelledAt", "statusUpdatedAt", "updatedAt"]));
      if (k) refundByDay.set(k, (refundByDay.get(k) || 0) + s.refundedCents);
    }
  }

  const days = Array.from(new Set([...grossByDay.keys(), ...refundByDay.keys()])).sort();
  let cumG = 0,
    cumR = 0;
  const netSeries = [];
  for (const d of days) {
    cumG += grossByDay.get(d) || 0;
    cumR += refundByDay.get(d) || 0;
    netSeries.push({ date: d, value: (cumG - cumR) / 100 });
  }

  const grossSum = Array.from(grossByDay.values()).reduce((a, b) => a + b, 0);
  const refundSum = Array.from(refundByDay.values()).reduce((a, b) => a + b, 0);
  return {
    netSeries,
    totals: { gross: grossSum / 100, refunds: refundSum / 100, net: (grossSum - refundSum) / 100 },
  };
}

/* =============================
   Net + Profit graph
   ============================= */
function RevenueSparkline({ data, height = 120, padding = 12 }) {
  const width = 640;
  if (!data || data.length === 0) {
    return <div className="muted small">No revenue yet.</div>;
  }

  const xs = data.map((d, i) =>
    data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - padding * 2) + padding
  );

  const netVals = data.map((d) => d.value);
  const profitVals = data.map((d) => d.value * 0.4); // estimated profit (40% of net)

  const minVal = 0;
  const maxVal = Math.max(...netVals, ...profitVals, 1);

  const yFromVal = (val) => {
    const t = (val - minVal) / (maxVal - minVal || 1);
    return height - padding - t * (height - padding * 2);
  };

  const netYs = netVals.map(yFromVal);
  const profitYs = profitVals.map(yFromVal);

  const makePath = (ys) =>
    xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");

  const netPath = makePath(netYs);
  const profitPath = makePath(profitYs);

  const netArea =
    `M ${xs[0]} ${height - padding} ` +
    xs.map((x, i) => `L ${x} ${netYs[i]}`).join(" ") +
    ` L ${xs[xs.length - 1]} ${height - padding} Z`;

  const last = data[data.length - 1];
  const lastProfitVal = last.value * 0.4;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue and profit trend">
        {/* baseline */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          opacity="0.15"
        />

        {/* net revenue area + line */}
        <path d={netArea} fill="#2563eb" opacity="0.06" />
        <path d={netPath} fill="none" stroke="#2563eb" strokeWidth="2" />
        <circle cx={xs[xs.length - 1]} cy={netYs[netYs.length - 1]} r="3" fill="#2563eb" />

        {/* profit line */}
        <path d={profitPath} fill="none" stroke="#16a34a" strokeWidth="2" />
        <circle cx={xs[xs.length - 1]} cy={profitYs[profitYs.length - 1]} r="3" fill="#16a34a" />
      </svg>

      {/* dates + latest values */}
      <div
        className="muted small"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span>{data[0].date}</span>
        <span>
          {last.date} · Net{" "}
          {last.value.toLocaleString(undefined, { style: "currency", currency: DISPLAY_CURRENCY })} · Profit{" "}
          {lastProfitVal.toLocaleString(undefined, { style: "currency", currency: DISPLAY_CURRENCY })}
        </span>
      </div>

      {/* legend */}
      <div className="muted small" style={{ marginTop: 4, display: "flex", gap: 12 }}>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#2563eb",
              marginRight: 4,
            }}
          />
          Net revenue
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#16a34a",
              marginRight: 4,
            }}
          />
          Profit (estimated)
        </span>
      </div>
    </div>
  );
}

/* =============================
   Page
   ============================= */
export default function Dashboard() {
  const [designs, setDesigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [customs, setCustoms] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firestore
  const db = useMemo(() => {
    try {
      return getFirestore(auth?.app || undefined);
    } catch {
      return getFirestore();
    }
  }, []);

  // static panels still use provider (unchanged)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, p, s] = await Promise.all([
          provider.listDesigns().catch(() => []),
          provider.listProducts().catch(() => []),
          provider.listShipments().catch(() => []),
        ]);
        if (!alive) return;
        setDesigns(d || []);
        setProducts(p || []);
        setShipments(s || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // realtime orders/repairs/custom_orders
  useEffect(() => {
    const stops = [
      onSnapshot(
        collection(db, "orders"),
        (snap) => {
          setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (e) => console.error("[Dashboard] orders snapshot:", e)
      ),
      onSnapshot(
        collection(db, "repairs"),
        (snap) => {
          setRepairs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (e) => console.error("[Dashboard] repairs snapshot:", e)
      ),
      onSnapshot(
        collection(db, "custom_orders"),
        (snap) => {
          setCustoms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (e) => console.error("[Dashboard] custom_orders snapshot:", e)
      ),
    ];
    return () => stops.forEach((s) => s && s());
  }, [db]);

  // ---- Merge orders + repairs + customs into one sales list ----
  const sales = useMemo(() => {
    // Normalize orders
    const orderSales = (orders || []).map((o) => normalizeSale(o, "order"));

    // If an order references a repairId, we'll skip counting that repair to avoid double-counting
    const repairIdsInOrders = new Set(
      (orders || [])
        .map((o) => o?.repairId)
        .filter(Boolean)
        .map(String)
    );

    // Normalize repairs that DON'T have a linked order already
    const repairSales = (repairs || [])
      .filter((r) => !repairIdsInOrders.has(String(r?.id)))
      .map((r) => normalizeSale(r, "repair"));

    // Customization: if you later link these into an order, you can add a similar exclusion.
    const customSales = (customs || []).map((c) => normalizeSale(c, "custom"));

    return [...orderSales, ...repairSales, ...customSales];
  }, [orders, repairs, customs]);

  // Revenue from merged sales
  const { netSeries, totals } = useMemo(
    () => buildNetRevenueSeriesFromSales(sales),
    [sales]
  );

  const kpis = useMemo(() => {
    const shipped = shipments.filter((s) =>
      ["shipped", "in_transit", "out_for_delivery", "delivered"].includes(s.status)
    ).length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;

    const cancelledCount = sales.filter((s) =>
      ["cancelled", "canceled"].includes(s.status)
    ).length;

    return {
      designs: designs.length,
      products: products.length,
      orders: orders.length,
      shipments: shipments.length,
      shipped,
      delivered,
      grossRevenue: totals.gross || 0,
      refunds: totals.refunds || 0,
      revenue: totals.net || 0,
      cancelledCount,
    };
  }, [designs, products, orders, shipments, totals, sales]);

  return (
    <div className="admin-root-page">
      <h2>Dashboard</h2>

      {/* KPIs */}
      <div className="admin-grid" style={{ gridTemplateColumns: "repeat(8, 1fr)", gap: 12 }}>
        <KPI label="Designs" value={kpis.designs} />
        <KPI label="Products" value={kpis.products} />
        <KPI label="Orders" value={kpis.orders} />
        <KPI label="Shipments" value={kpis.shipments} />
        <KPI label="Shipped+" value={kpis.shipped} />
        <KPI label="Delivered" value={kpis.delivered} />
        <KPI label="Cancelled Orders" value={kpis.cancelledCount} />
        <KPI
          label="Refunds"
          value={kpis.refunds.toLocaleString(undefined, {
            style: "currency",
            currency: DISPLAY_CURRENCY,
          })}
        />
      </div>

      <div
        className="admin-grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}
      >
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
                  <th>Name</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {(() => {
                        const cents =
                          typeof p.priceCents === "number" ? p.priceCents : null;
                        const price =
                          cents != null
                            ? cents / 100
                            : p.basePrice != null
                            ? Number(p.basePrice)
                            : Number(p.price || 0);
                        const cur = p.currency || DISPLAY_CURRENCY;
                        return Number(price || 0).toLocaleString(undefined, {
                          style: "currency",
                          currency: cur,
                        });
                      })()}
                    </td>
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
                    <td>
                      {s.updatedAt
                        ? new Date(tsToMillis(s.updatedAt)).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Revenue card */}
      <div className="admin-card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Revenue (Net)</h3>
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          {kpis.revenue.toLocaleString(undefined, {
            style: "currency",
            currency: DISPLAY_CURRENCY,
          })}
        </div>
        <div className="muted small">Gross – refunds (cumulative)</div>

        {/* Graph: net + profit over time */}
        <div style={{ marginTop: 8 }}>
          <RevenueSparkline data={netSeries} />
        </div>

        {/* Text breakdown (no materials, profit only as amount) */}
        <div className="muted small" style={{ marginTop: 8 }}>
          Gross:&nbsp;
          <strong>
            {kpis.grossRevenue.toLocaleString(undefined, {
              style: "currency",
              currency: DISPLAY_CURRENCY,
            })}
          </strong>
          &nbsp; · Refunds:&nbsp;
          <strong>
            {kpis.refunds.toLocaleString(undefined, {
              style: "currency",
              currency: DISPLAY_CURRENCY,
            })}
          </strong>
          &nbsp; · Net:&nbsp;
          <strong>
            {kpis.revenue.toLocaleString(undefined, {
              style: "currency",
              currency: DISPLAY_CURRENCY,
            })}
          </strong>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Profit (estimated):&nbsp;
          <strong>
            {(kpis.revenue * 0.4).toLocaleString(undefined, {
              style: "currency",
              currency: DISPLAY_CURRENCY,
            })}
          </strong>
        </div>
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
