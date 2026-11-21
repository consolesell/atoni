/**
 * Shared security sanitization helpers ensuring API tokens, secrets, passwords,
 * OAuth tokens, and sensitive credentials are never written to localStorage,
 * session snapshots, persistent memory, logs, or Firebase Firestore.
 */

const SECRET_KEY_PATTERN =
  /^(token|pat|api_?token|oauth_?token|access_?token|refresh_?token|session_?token|deriv_?api_?token|api_?key|apikey|gemini_?api_?keys?|secret|client_?secret|password|authorization|auth_?header|bearer|private_?key|credential|credentials)$/i;

const SECRET_VALUE_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /sk-[A-Za-z0-9]{20,}/g,
];

export function redactStringSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function sanitizeForPersistence<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactStringSecrets(value) as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForPersistence(item, depth + 1)) as unknown as T;
  }

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(value as Record<string, any>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    if (val === undefined) {
      continue;
    }
    clean[key] = sanitizeForPersistence(val, depth + 1);
  }
  return clean as T;
}

export function containsSecretFields(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSecretFields(item, depth + 1));
  }
  for (const [key, val] of Object.entries(value as Record<string, any>)) {
    if (SECRET_KEY_PATTERN.test(key) && val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val) && val.length === 0) continue;
      return true;
    }
    if (containsSecretFields(val, depth + 1)) {
      return true;
    }
  }
  return false;
}
