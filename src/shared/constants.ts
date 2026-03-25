export const STORAGE_KEYS = {
  syncSettings: "settings",
  localDevice: "device",
} as const;

export const LEGACY_STORAGE_KEYS = {
  sync: ["username", "password", "encrypted_password", "salt", "iv", "use_login"] as const,
  local: ["cached_key"] as const,
} as const;

export const APP_VERSION = "3.0.0";

export const PASSWORD_MIN_LENGTH = 6;
export const MASTER_PASSWORD_MIN_LENGTH = 6;

export const CRYPTO_CONFIG = {
  algorithm: "AES-GCM",
  keyLength: 256,
  pbkdf2Iterations: 100_000,
  saltLength: 16,
  ivLength: 12,
} as const;

export const LOGIN_FORM_TIMEOUT_MS = 5_000;
