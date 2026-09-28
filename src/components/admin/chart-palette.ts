import type { OrderStatus } from "@prisma/client";

export const CHART = {
  lime: "#c8f169",
  olive: "#2f3b22",
  sage: "#a9c3a2",
  cream: "#f4f6ec",
  grid: "rgba(47, 59, 34, 0.12)",
} as const;

export const STATUS_HEX: Record<OrderStatus, string> = {
  PENDING: "#f59e0b",
  PAID: "#c8f169",
  PROCESSING: "#0ea5e9",
  SHIPPED: "#8b5cf6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
};
