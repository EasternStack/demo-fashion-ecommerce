export interface ShippingProvider {
  createShipment(orderId: string): Promise<{ carrier: string; trackingNumber: string }>;
}
