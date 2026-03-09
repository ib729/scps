const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptRecord = {
  count: number;
  firstAttemptAt: number;
};

const signupAttempts = new Map<string, AttemptRecord>();

function cleanupExpired(now: number) {
  for (const [key, record] of signupAttempts.entries()) {
    if (now - record.firstAttemptAt > ATTEMPT_WINDOW_MS) {
      signupAttempts.delete(key);
    }
  }
}

export function isSignupRateLimited(key: string) {
  const now = Date.now();
  cleanupExpired(now);

  const record = signupAttempts.get(key);
  if (!record) {
    return false;
  }

  if (now - record.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    signupAttempts.delete(key);
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

export function recordSignupAttempt(key: string) {
  const now = Date.now();
  const record = signupAttempts.get(key);

  if (!record || now - record.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    signupAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
    });
    return;
  }

  signupAttempts.set(key, {
    count: record.count + 1,
    firstAttemptAt: record.firstAttemptAt,
  });
}

export function clearSignupAttempts(key: string) {
  signupAttempts.delete(key);
}
