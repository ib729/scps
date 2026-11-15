export const DEFAULT_SERVER_URL = process.env.NEXTJS_URL || "http://localhost:3000";
export const DEFAULT_LANE_ID = process.env.POS_LANE_ID || "default";
export const DEFAULT_NFC_DEVICE = "tty:AMA0:pn532";
export const NFC_TAP_SECRET = process.env.NFC_TAP_SECRET;
export const NFC_DEBOUNCE_MS = 1500;
export const NFC_POLL_INTERVAL_MS = 100;
export const NFC_TIMEOUT_MS = 5000;
