export const PAYMENT_METHOD_VALUES = [
  "Cash",
  "WeChat",
  "Alipay",
  "Bitcoin",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export const OTHER_PAYMENT_METHOD_MAX_LENGTH = 40;
