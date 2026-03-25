import { PasswordCrypto } from "../src/shared/crypto";
import { PopupController } from "../src/popup/controller";
import { ExtensionStorageService } from "../src/shared/storage";
import type { SyncSettings } from "../src/shared/types";
import { createMockChrome } from "./helpers/mockChrome";

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createPopupHarness(initialData?: { sync?: Record<string, unknown>; local?: Record<string, unknown> }) {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const { chromeLike, syncStore, localStore } = createMockChrome(initialData);
  const popup = new PopupController(root, new ExtensionStorageService(chromeLike), new PasswordCrypto(), document);
  await popup.init();

  return { root, syncStore, localStore };
}

function queryInput(root: HTMLElement, selector: string): HTMLInputElement {
  const element = root.querySelector<HTMLInputElement>(selector);

  if (!element) {
    throw new Error(`找不到输入框 ${selector}`);
  }

  return element;
}

function queryButton(root: HTMLElement, selector: string): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>(selector);

  if (!element) {
    throw new Error(`找不到按钮 ${selector}`);
  }

  return element;
}

describe("PopupController", () => {
  it("首次配置后会保存设置并进入 ready 状态", async () => {
    const { root, syncStore, localStore } = await createPopupHarness();

    queryInput(root, "#usernameInput").value = "2400012345";
    queryInput(root, "#passwordInput").value = "secret-password";
    queryInput(root, "#masterPasswordInput").value = "master-pass";
    queryButton(root, "#submitButton").click();

    await vi.waitFor(() => {
      expect((syncStore.settings as SyncSettings).username).toBe("2400012345");
      expect((localStore.device as { cachedKeyJwk: JsonWebKey }).cachedKeyJwk).toBeTruthy();
      expect(queryButton(root, "#submitButton").textContent).toBe("更新配置");
    });
  });

  it("锁定状态下输入主密码可以解锁", async () => {
    const passwordCrypto = new PasswordCrypto();
    const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
    const settings: SyncSettings = {
      version: 1,
      username: "2400012345",
      autoLoginEnabled: true,
      encryptedPassword: bundle.encryptedPassword,
      salt: bundle.salt,
      iv: bundle.iv,
    };

    const { root, localStore } = await createPopupHarness({
      sync: {
        settings,
      },
    });

    expect(queryButton(root, "#submitButton").textContent).toBe("解锁");

    queryInput(root, "#masterPasswordInput").value = "master-pass";
    queryButton(root, "#submitButton").click();

    await vi.waitFor(() => {
      expect((localStore.device as { cachedKeyJwk: JsonWebKey }).cachedKeyJwk).toBeTruthy();
      expect(queryButton(root, "#submitButton").textContent).toBe("更新配置");
    });
  });

  it("切换自动登录会立即更新同步设置", async () => {
    const passwordCrypto = new PasswordCrypto();
    const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
    const settings: SyncSettings = {
      version: 1,
      username: "2400012345",
      autoLoginEnabled: true,
      encryptedPassword: bundle.encryptedPassword,
      salt: bundle.salt,
      iv: bundle.iv,
    };

    const { root, syncStore } = await createPopupHarness({
      sync: {
        settings,
      },
      local: {
        device: { cachedKeyJwk: bundle.cachedKeyJwk },
      },
    });

    const toggle = queryInput(root, "#autoLoginToggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect((syncStore.settings as SyncSettings).autoLoginEnabled).toBe(false);
  });

  it("清除数据会移除新旧存储内容并回到 setup 状态", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const passwordCrypto = new PasswordCrypto();
    const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
    const settings: SyncSettings = {
      version: 1,
      username: "2400012345",
      autoLoginEnabled: true,
      encryptedPassword: bundle.encryptedPassword,
      salt: bundle.salt,
      iv: bundle.iv,
    };

    const { root, syncStore, localStore } = await createPopupHarness({
      sync: {
        settings,
        username: "legacy-user",
      },
      local: {
        device: { cachedKeyJwk: bundle.cachedKeyJwk },
        cached_key: { legacy: true },
      },
    });

    queryButton(root, "#clearButton").click();

    await vi.waitFor(() => {
      expect(syncStore.settings).toBeUndefined();
      expect(syncStore.username).toBeUndefined();
      expect(localStore.device).toBeUndefined();
      expect(localStore.cached_key).toBeUndefined();
      expect(queryButton(root, "#submitButton").textContent).toBe("保存配置");
    });
  });
});
