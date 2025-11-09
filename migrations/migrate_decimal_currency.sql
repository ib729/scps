-- Migration to support decimal currency (tenth-unit scaling)
-- This migration multiplies all balance/amount/overdraft values by 10
-- to store them as tenths of CNY (e.g., ¥5.5 becomes 55)
-- Run this with: sqlite3 stuco.db < migrate_decimal_currency.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Step 1: Multiply all existing balances by 10
UPDATE accounts SET balance = balance * 10;

-- Step 2: Multiply all existing transaction amounts by 10
UPDATE transactions SET amount = amount * 10;

-- Step 3: Multiply all existing overdraft components by 10
UPDATE transactions SET overdraft_component = overdraft_component * 10;

-- Step 4: Multiply all existing overdraft week usage by 10
UPDATE overdraft_weeks SET used = used * 10;

-- Step 5: Multiply all max_overdraft_week limits by 10
UPDATE accounts SET max_overdraft_week = max_overdraft_week * 10;

COMMIT;

PRAGMA foreign_keys = ON;

-- Verify the migration
SELECT 'Migration completed successfully!';
SELECT 'Sample balances (should be 10x original):';
SELECT s.name, a.balance, a.max_overdraft_week 
FROM students s 
JOIN accounts a ON s.id = a.student_id 
LIMIT 5;

