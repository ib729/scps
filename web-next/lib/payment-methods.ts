export const PAYMENT_METHOD_VALUES = [
  "Cash",
  "WeChat",
  "Alipay",
  "Bank Transfer",
  "Card",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];
