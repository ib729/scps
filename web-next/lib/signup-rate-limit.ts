const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptRecord = {
  count: number;
  firstAttemptAt: number;
};

// shortcut: budgets reset on process restart; use shared storage before adding web workers.
const signupAttempts = new Map<string, AttemptRecord>();

function cleanupExpired(now: number) {
  for (const [key, record] of signupAttempts.entries()) {
    if (now - record.firstAttemptAt >= ATTEMPT_WINDOW_MS) {
      signupAttempts.delete(key);
    }
  }
}

export function consumeSignupAttempt(key: string): boolean {
  const now = Date.now();
  cleanupExpired(now);
  const record = signupAttempts.get(key);
  if (record && record.count >= MAX_ATTEMPTS) return false;
  if (record) record.count++;
  else signupAttempts.set(key, { count: 1, firstAttemptAt: now });
  return true;
}
