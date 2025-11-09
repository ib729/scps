/**
 * Currency conversion utilities for tenth-unit scaling
 * 
 * The database stores all monetary values as tenths of CNY (integers).
 * For example: ¥5.5 is stored as 55, ¥20.0 is stored as 200
 * 
 * This allows us to support one decimal place precision while using
 * INTEGER columns in SQLite for performance and simplicity.
 */

/**
 * Convert display value (e.g., 5.5) to database value (e.g., 55)
 * @param displayValue The decimal value to display to users
 * @returns The integer value to store in the database (tenths)
 */
export function toDbValue(displayValue: number): number {
  return Math.round(displayValue * 10);
}

/**
 * Convert database value (e.g., 55) to display value (e.g., 5.5)
 * @param dbValue The integer value from the database (tenths)
 * @returns The decimal value to display to users
 */
export function toDisplayValue(dbValue: number): number {
  return dbValue / 10;
}

/**
 * Format a database value as a currency string with one decimal place
 * @param dbValue The integer value from the database (tenths)
 * @returns Formatted string like "5.5" or "20.0"
 */
export function formatCurrency(dbValue: number): string {
  return (dbValue / 10).toFixed(1);
}

/**
 * Parse a user input string to a database value
 * Handles both integer and decimal inputs
 * @param input User input string (e.g., "5.5", "20", "10.0")
 * @returns The integer value to store in the database (tenths)
 */
export function parseUserInput(input: string | number): number {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  if (isNaN(num)) {
    throw new Error('Invalid number input');
  }
  return toDbValue(num);
}

