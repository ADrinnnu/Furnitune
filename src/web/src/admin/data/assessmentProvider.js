// web/src/admin/data/assessmentProvider.js
import {
  getFirestore,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { auth } from "../../firebase";

/* utils */
const C = (n) => Math.max(0, Math.round(Number(n || 0)));

async function notify(db, uid, payload) {
  if (!uid) return;
  try {
    await addDoc(collection(db, "users", uid, "notifications"), {
      createdAt: serverTimestamp(),
      read: false,
      ...payload,
    });
  } catch (e) {
    console.warn("notify failed", e);
  }
}

async function findLinkedOrder(db, kind, id) {
  if (kind === "repair") {
    const qy = query(collection(db, "orders"), where("repairId", "==", id));
    const snap = await getDocs(qy);
    const d = snap.docs[0];
    return d ? { id: d.id, ...d.data() } : null;
  }
  if (kind === "custom") {
    const cs = await getDoc(doc(db, "custom_orders", id));
    const c = cs.exists() ? cs.data() : null;
    const orderId = c?.orderId;
    if (!orderId) return null;
    const os = await getDoc(doc(db, "orders", orderId));
    return os.exists() ? { id: os.id, ...os.data() } : null;
  }
  return null;
}

/**
 * Single entry point used by admin UI.
 * - Sets assessed total
 * - Requests an additional payment (defaults to current balance)
 * - Updates paymentStatus accordingly
 */
export async function upsertAssessmentAndRequest({
  kind,                 // "repair" | "custom"
  id,                   // repairId | customId
  assessedTotalCents,   // required
  requestAmountCents,   // optional; if not provided, uses computed balance
  note = "",
}) {
  const db = getFirestore(auth.app);
  const assessedC = C(assessedTotalCents);

  const order = await findLinkedOrder(db, kind, id);
  const coll = kind === "repair" ? "repairs" : "custom_orders";
  if (!order) throw new Error("Linked order not found.");

  // compute balance from latest order data
  const fresh = (await getDoc(doc(db, "orders", order.id))).data() || order;
  const depositC = C(fresh.depositCents);
  const addsC    = C(fresh.additionalPaymentsCents);
  const refundsC = C(fresh.refundsCents);
  const netPaid  = Math.max(0, depositC + addsC - refundsC);
  const balance  = assessedC > 0 ? Math.max(0, assessedC - netPaid) : 0;

  const requestedC = C(requestAmountCents != null ? requestAmountCents : balance);

  // next status
  const nextPayment =
    assessedC > 0 && requestedC > 0 ? "awaiting_additional_payment" :
    assessedC > 0 && balance === 0   ? "paid" :
    "pending";

  // update order
  await updateDoc(doc(db, "orders", order.id), {
    assessedTotalCents: assessedC,
    assessmentStatus: "finalized",
    assessmentNotes: note || null,
    requestedAdditionalPaymentCents: requestedC,
    additionalPaymentRequestNote: requestedC ? (note || null) : null,
    additionalPaymentRequestedAt: requestedC ? serverTimestamp() : null,
    paymentStatus: nextPayment,
    paymentUpdatedAt: serverTimestamp(),
  });

  // mirror to source record for transparency
  await updateDoc(doc(db, coll, id), {
    assessedTotalCents: assessedC,
    assessmentStatus: "finalized",
    assessmentNotes: note || null,
    requestedAdditionalPaymentCents: requestedC,
    additionalPaymentRequestNote: requestedC ? (note || null) : null,
    additionalPaymentRequestedAt: requestedC ? serverTimestamp() : null,
    paymentStatus: nextPayment,
    paymentUpdatedAt: serverTimestamp(),
  });

  // notify user
  await notify(db, fresh.userId, {
    type: "order_status",
    orderId: order.id,
    status: nextPayment,
    title:
      nextPayment === "paid"
        ? "Assessment finalized — fully paid"
        : "Additional payment requested",
    body:
      nextPayment === "paid"
        ? "Your order is fully paid. Thank you!"
        : `Please pay ₱${(requestedC / 100).toLocaleString()} for your order.`,
    link: `/ordersummary?orderId=${order.id}`,
  });
}
