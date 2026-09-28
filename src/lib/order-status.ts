import type { OrderStatus } from "@prisma/client";

export const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function allowedTargets(from: OrderStatus): OrderStatus[] {
  return [...VALID_TRANSITIONS[from]];
}

export function isCancellable(status: OrderStatus): boolean {
  return canTransition(status, "CANCELLED");
}
