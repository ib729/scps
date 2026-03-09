/**
 * Currency conversion utilities for cent-based scaling.
 *
 * The database stores all monetary values as integer cents.
 * For example: ¥5.50 is stored as 550, ¥20.00 is stored as 2000.
 */

export const CURRENCY_SCALE = 100;
export const LOW_BALANCE_THRESHOLD = 500; // ¥5.00

/**
 * Convert a display value (e.g. 5.5) to cents (e.g. 550).
 * @param displayValue The decimal value to display to users
 * @returns The integer value to store in the database (cents)
 */
export function toDbValue(displayValue: number): number {
  return Math.round(displayValue * CURRENCY_SCALE);
}

/**
 * Convert cents (e.g. 550) to a display value (e.g. 5.5).
 * @param dbValue The integer value from the database (cents)
 * @returns The decimal value to display to users
 */
export function toDisplayValue(dbValue: number): number {
  return dbValue / CURRENCY_SCALE;
}

/**
 * Format a database value as a currency string with two decimal places.
 * @param dbValue The integer value from the database (cents)
 * @returns Formatted string like "5.50" or "20.00"
 */
export function formatCurrency(dbValue: number): string {
  return toDisplayValue(dbValue).toFixed(2);
}

/**
 * Parse a user input string to a database value
 * Handles both integer and decimal inputs
 * @param input User input string (e.g. "5.50", "20", "10.25")
 * @returns The integer value to store in the database (cents)
 */
export function parseUserInput(input: string | number): number {
  const num = typeof input === "string" ? Number.parseFloat(input) : input;
  if (isNaN(num)) {
    throw new Error("Invalid number input");
  }
  return toDbValue(num);
}
