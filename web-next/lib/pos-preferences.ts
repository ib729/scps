export type PosDefaultMode = "tap-first" | "manual";
export type NFCReader = "reader-1" | "reader-2";

export const POS_DEFAULT_MODE_STORAGE_KEY = "pos_default_mode";
export const DEFAULT_POS_MODE: PosDefaultMode = "tap-first";
export const DEFAULT_NFC_READER: NFCReader = "reader-1";

export function parsePosDefaultMode(value: string | null | undefined): PosDefaultMode {
  return value === "manual" ? "manual" : DEFAULT_POS_MODE;
}

export function parseNfcReader(value: string | null | undefined): NFCReader {
  return value === "reader-2" ? "reader-2" : DEFAULT_NFC_READER;
}
