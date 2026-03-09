export type PosDefaultMode = "tap-first" | "manual";

export const POS_DEFAULT_MODE_STORAGE_KEY = "pos_default_mode";
export const DEFAULT_POS_MODE: PosDefaultMode = "tap-first";

export function parsePosDefaultMode(value: string | null | undefined): PosDefaultMode {
  return value === "manual" ? "manual" : DEFAULT_POS_MODE;
}
