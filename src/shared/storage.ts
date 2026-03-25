import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "./constants";
import type { LegacyStorageSnapshot, LocalDeviceSession, SyncSettings } from "./types";

type StorageGetKeys = string | string[] | Record<string, unknown> | null;

interface StorageAreaLike {
  get(keys: StorageGetKeys, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(keys: string | string[], callback?: () => void): void;
}

export interface ChromeLike {
  storage: {
    sync: StorageAreaLike;
    local: StorageAreaLike;
  };
  runtime?: {
    lastError?: {
      message?: string;
    };
  };
}

function isSyncSettings(value: unknown): value is SyncSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SyncSettings>;
  return (
    candidate.version === 1 &&
    typeof candidate.username === "string" &&
    typeof candidate.autoLoginEnabled === "boolean" &&
    typeof candidate.encryptedPassword === "string" &&
    typeof candidate.salt === "string" &&
    typeof candidate.iv === "string"
  );
}

function isLocalDeviceSession(value: unknown): value is LocalDeviceSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalDeviceSession>;
  return candidate.cachedKeyJwk === null || typeof candidate.cachedKeyJwk === "object";
}

function hasStoredValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  return true;
}

export function getExtensionChrome(): ChromeLike {
  if (typeof chrome === "undefined" || !chrome.storage?.sync || !chrome.storage?.local) {
    throw new Error("当前环境不支持 Chrome Extension storage API");
  }

  return chrome as unknown as ChromeLike;
}

export class ExtensionStorageService {
  constructor(private readonly extensionChrome: ChromeLike) {}

  async getSyncSettings(): Promise<SyncSettings | null> {
    const items = await this.getFromArea(this.extensionChrome.storage.sync, STORAGE_KEYS.syncSettings);
    const rawSettings = items[STORAGE_KEYS.syncSettings];
    return isSyncSettings(rawSettings) ? rawSettings : null;
  }

  async saveSyncSettings(settings: SyncSettings): Promise<void> {
    await this.setToArea(this.extensionChrome.storage.sync, {
      [STORAGE_KEYS.syncSettings]: settings,
    });
  }

  async getLocalDeviceSession(): Promise<LocalDeviceSession> {
    const items = await this.getFromArea(this.extensionChrome.storage.local, STORAGE_KEYS.localDevice);
    const rawDevice = items[STORAGE_KEYS.localDevice];

    if (isLocalDeviceSession(rawDevice)) {
      return rawDevice;
    }

    return { cachedKeyJwk: null };
  }

  async saveLocalDeviceSession(device: LocalDeviceSession | null): Promise<void> {
    if (!device) {
      await this.removeFromArea(this.extensionChrome.storage.local, STORAGE_KEYS.localDevice);
      return;
    }

    await this.setToArea(this.extensionChrome.storage.local, {
      [STORAGE_KEYS.localDevice]: device,
    });
  }

  async detectLegacyStorage(): Promise<LegacyStorageSnapshot> {
    const [syncItems, localItems] = await Promise.all([
      this.getFromArea(this.extensionChrome.storage.sync, [...LEGACY_STORAGE_KEYS.sync]),
      this.getFromArea(this.extensionChrome.storage.local, [...LEGACY_STORAGE_KEYS.local]),
    ]);

    const hasLegacySyncData = LEGACY_STORAGE_KEYS.sync.some((key) => hasStoredValue(syncItems[key]));
    const hasLegacyLocalData = LEGACY_STORAGE_KEYS.local.some((key) => hasStoredValue(localItems[key]));

    return {
      hasLegacySyncData,
      hasLegacyLocalData,
      hasAnyLegacyData: hasLegacySyncData || hasLegacyLocalData,
    };
  }

  async clearAllData(): Promise<void> {
    await Promise.all([
      this.removeFromArea(this.extensionChrome.storage.sync, [
        STORAGE_KEYS.syncSettings,
        ...LEGACY_STORAGE_KEYS.sync,
      ]),
      this.removeFromArea(this.extensionChrome.storage.local, [
        STORAGE_KEYS.localDevice,
        ...LEGACY_STORAGE_KEYS.local,
      ]),
    ]);
  }

  private async getFromArea(area: StorageAreaLike, keys: StorageGetKeys): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      area.get(keys, (items) => {
        const runtimeError = this.extensionChrome.runtime?.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message ?? "读取浏览器存储失败"));
          return;
        }

        resolve(items ?? {});
      });
    });
  }

  private async setToArea(area: StorageAreaLike, items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      area.set(items, () => {
        const runtimeError = this.extensionChrome.runtime?.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message ?? "写入浏览器存储失败"));
          return;
        }

        resolve();
      });
    });
  }

  private async removeFromArea(area: StorageAreaLike, keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      area.remove(keys, () => {
        const runtimeError = this.extensionChrome.runtime?.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message ?? "清理浏览器存储失败"));
          return;
        }

        resolve();
      });
    });
  }
}
