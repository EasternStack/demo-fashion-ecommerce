import { randomInt } from "node:crypto";
import { prisma } from "@/server/db";
import type { ShippingProvider } from "./index";

export const mockCourier: ShippingProvider = {
  async createShipment(orderId: string) {
    const trackingNumber = `MKX-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    await prisma.shipment.create({ data: { orderId, carrier: "Mock Express", trackingNumber } });
    return { carrier: "Mock Express", trackingNumber };
  },
};
