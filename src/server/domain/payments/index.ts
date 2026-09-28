export type CardInput = { cardNumber: string; expiry: string; cvc: string };
export type PaymentResult = { ok: true } | { error: string };

export interface PaymentProvider {
  validate(input: CardInput): { ok: true } | { error: string };
  settle(orderCode: string, input: CardInput): Promise<PaymentResult>;
}
