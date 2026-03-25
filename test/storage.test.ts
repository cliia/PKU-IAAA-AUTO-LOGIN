import { STORAGE_KEYS } from "../src/shared/constants";
import { ExtensionStorageService } from "../src/shared/storage";
import type { SyncSettings } from "../src/shared/types";
import { createMockChrome } from "./helpers/mockChrome";

describe("ExtensionStorageService", () => {
  it("可以保存并读取新版本设置", async () => {
    const { chromeLike } = createMockChrome();
    const storage = new ExtensionStorageService(chromeLike);
    const settings: SyncSettings = {
      version: 1,
      username: "2400012345",
      autoLoginEnabled: true,
      encryptedPassword: "cipher-text",
      salt: "salt",
      iv: "iv",
    };

    await storage.saveSyncSettings(settings);
    await storage.saveLocalDeviceSession({ cachedKeyJwk: { kty: "oct", k: "abc", alg: "A256GCM", ext: true } });

    await expect(storage.getSyncSettings()).resolves.toEqual(settings);
    await expect(storage.getLocalDeviceSession()).resolves.toEqual({
      cachedKeyJwk: { kty: "oct", k: "abc", alg: "A256GCM", ext: true },
    });
  });

  it("可以识别旧版数据并在清理时一并移除", async () => {
    const { chromeLike, syncStore, localStore } = createMockChrome({
      sync: {
        username: "legacy-user",
        password: "legacy-password",
      },
      local: {
        cached_key: { key_ops: ["encrypt"] },
      },
    });
    const storage = new ExtensionStorageService(chromeLike);

    await expect(storage.detectLegacyStorage()).resolves.toEqual({
      hasLegacySyncData: true,
      hasLegacyLocalData: true,
      hasAnyLegacyData: true,
    });

    await storage.clearAllData();

    expect(syncStore[STORAGE_KEYS.syncSettings]).toBeUndefined();
    expect(syncStore.username).toBeUndefined();
    expect(syncStore.password).toBeUndefined();
    expect(localStore[STORAGE_KEYS.localDevice]).toBeUndefined();
    expect(localStore.cached_key).toBeUndefined();
  });
});
