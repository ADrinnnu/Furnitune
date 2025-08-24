import { db, auth } from "./firebaseCore";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const col = (name) => collection(db, name);

async function currentUser() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) return resolve(null);
      // TODO: read actual role from users/{uid} or custom claims
      const role = "admin";
      resolve({ uid: u.uid, email: u.email ?? undefined, emailVerified: !!u.emailVerified, role });
    });
  });
}

export const firebaseProvider = {
  async getCurrentUser(){ return currentUser(); },
  async requireRole(roles){
    const u = await currentUser();
    if (!u || !roles.includes(u.role)) throw new Error("Forbidden");
  },

  // Designs
  async listDesigns(){
    const snap = await getDocs(query(col("designs"), orderBy("createdAt","desc")));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  },
  async createDesign(d){
    const ref = await addDoc(col("designs"), {
      name: d.name, description: d.description ?? "", status: d.status ?? "draft", createdAt: serverTimestamp()
    });
    return { id: ref.id, name: d.name, description: d.description, status: d.status ?? "draft", createdAt: Date.now() };
  },
  async updateDesign(id, d){
    await updateDoc(doc(db, "designs", id), d);
    return { id, ...d };
  },

  // Products
  async listProducts(){
    const snap = await getDocs(query(col("products"), orderBy("createdAt","desc")));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  },
  async createProduct(p){
    const ref = await addDoc(col("products"), { ...p, createdAt: serverTimestamp() });
    return { id: ref.id, ...p };
    },
  async updateProduct(id, p){
    await updateDoc(doc(db, "products", id), p);
    return { id, ...p };
  },
  async deleteProduct(id){
    await deleteDoc(doc(db, "products", id));
  },

  // Orders
  async listOrders(){
    const snap = await getDocs(query(col("orders"), orderBy("createdAt","desc")));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  },

  // Shipments
  async listShipments(){
    const snap = await getDocs(col("shipments"));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  },
  async advanceShipment(id, to, note){
    await updateDoc(doc(db, "shipments", id), { status: to, updatedAt: serverTimestamp() });
    await addDoc(col("shipment_events"), { shipmentId:id, to, note: note ?? "", at: serverTimestamp() });
  },
  async listShipmentEvents(id){
    const snap = await getDocs(query(col("shipment_events"), where("shipmentId","==",id), orderBy("at","asc")));
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  },

  // Users
  async listUsers(){
    const snap = await getDocs(col("users"));
    return snap.docs.map(d => ({ uid:d.id, ...(d.data() ) }));
  },
  async setUserRole(uid, role){
    await updateDoc(doc(db, "users", uid), { role });
  }
};
