
export type Role = "admin" | "manager" | "staff" | "viewer";

export type Design = { id: string; name: string; description?: string; status: "draft"|"active"|"archived"; createdAt: number; };
export type Product = { id: string; designId: string; sku: string; name: string; priceCents: number; currency: string; stock: number; isActive: boolean; createdAt: number; };
export type Order = { id: string; customerName: string; customerEmail?: string; totalCents: number; currency: string; createdAt: number; };
export type OrderItem = { id: string; orderId: string; productId: string; qty: number; priceCents: number; };
export type DeliveryStatus = "pending"|"processing"|"ready_to_ship"|"shipped"|"in_transit"|"out_for_delivery"|"delivered"|"returned"|"cancelled";
export type Shipment = { id: string; orderId: string; carrier?: string; tracking?: string; status: DeliveryStatus; updatedAt: number; };
export type ShipmentEvent = { id: string; shipmentId: string; from?: DeliveryStatus; to: DeliveryStatus; note?: string; by: string; at: number; };

export type AdminDataProvider = {
  // auth/roles
  getCurrentUser(): Promise<{ uid: string; email?: string; emailVerified?: boolean; role: Role } | null>;
  requireRole(roles: Role[]): Promise<void>;

  // designs/products
  listDesigns(): Promise<Design[]>;
  createDesign(d: Partial<Design>): Promise<Design>;
  updateDesign(id: string, d: Partial<Design>): Promise<Design>;

  listProducts(): Promise<Product[]>;
  createProduct(p: Partial<Product>): Promise<Product>;
  updateProduct(id: string, p: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  // orders/shipments
  listOrders(): Promise<Order[]>;
  listShipments(): Promise<Shipment[]>;
  advanceShipment(id: string, to: DeliveryStatus, note?: string): Promise<void>;
  listShipmentEvents(id: string): Promise<ShipmentEvent[]>;

  // users
  listUsers(): Promise<{ uid: string; email?: string; role: Role; disabled?: boolean }[]>;
  setUserRole(uid: string, role: Role): Promise<void>;
};
