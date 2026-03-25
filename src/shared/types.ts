export interface SyncSettings {
  version: 1;
  username: string;
  autoLoginEnabled: boolean;
  encryptedPassword: string;
  salt: string;
  iv: string;
}

export interface LocalDeviceSession {
  cachedKeyJwk: JsonWebKey | null;
}

export interface LegacyStorageSnapshot {
  hasLegacySyncData: boolean;
  hasLegacyLocalData: boolean;
  hasAnyLegacyData: boolean;
}

export interface EncryptionBundle {
  encryptedPassword: string;
  salt: string;
  iv: string;
  cachedKeyJwk: JsonWebKey;
}

export interface ReEncryptedPassword {
  encryptedPassword: string;
  iv: string;
}

export interface AuthCheckResponse {
  success?: boolean;
  isMobileAuthen?: boolean;
  authenMode?: string;
  isBind?: boolean;
}

export type PopupState = "setup" | "locked" | "ready";

export type AuthMode = "normal" | "sms" | "otp" | "otp-unbound";

export type MessageTone = "info" | "success" | "warning" | "error";
