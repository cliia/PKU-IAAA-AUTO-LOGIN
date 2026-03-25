import fixtureHtml from "./fixtures/iaaa-page.html?raw";
import { PasswordCrypto } from "../src/shared/crypto";
import { ExtensionStorageService } from "../src/shared/storage";
import { runAutoLogin } from "../src/content/runner";
import type { SyncSettings } from "../src/shared/types";
import { createMockChrome } from "./helpers/mockChrome";

function createLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function createReadyStorage(autoLoginEnabled = true) {
  const passwordCrypto = new PasswordCrypto();
  const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
  const settings: SyncSettings = {
    version: 1,
    username: "2400012345",
    autoLoginEnabled,
    encryptedPassword: bundle.encryptedPassword,
    salt: bundle.salt,
    iv: bundle.iv,
  };

  const { chromeLike } = createMockChrome({
    sync: {
      settings,
    },
    local: {
      device: { cachedKeyJwk: bundle.cachedKeyJwk },
    },
  });

  return new ExtensionStorageService(chromeLike);
}

function mountFixture(): void {
  document.body.innerHTML = fixtureHtml;
}

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe("runAutoLogin", () => {
  it("普通登录会填写凭据并调用 oauthLogon", async () => {
    vi.useFakeTimers();
    mountFixture();

    const oauthLogon = vi.fn();
    window.oauthLogon = oauthLogon;

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn().mockResolvedValue(createJsonResponse({ success: true, isMobileAuthen: false })),
      storage: await createReadyStorage(),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await vi.runAllTimersAsync();

    expect((document.querySelector("#user_name") as HTMLInputElement).value).toBe("2400012345");
    expect((document.querySelector("#password") as HTMLInputElement).value).toBe("secret-password");
    expect(oauthLogon).toHaveBeenCalledTimes(1);
  });

  it("短信模式会触发发送验证码并聚焦短信输入框", async () => {
    vi.useFakeTimers();
    mountFixture();

    const sendSMSCode = vi.fn();
    window.sendSMSCode = sendSMSCode;

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn().mockResolvedValue(
        createJsonResponse({ success: true, isMobileAuthen: true, authenMode: "SMS" }),
      ),
      storage: await createReadyStorage(),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await vi.runAllTimersAsync();

    expect(sendSMSCode).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("sms_code");
  });

  it("OTP 模式会显示 OTP 区域并聚焦输入框", async () => {
    vi.useFakeTimers();
    mountFixture();
    window.oauthLogon = vi.fn();

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn().mockResolvedValue(
        createJsonResponse({ success: true, isMobileAuthen: true, authenMode: "OTP", isBind: true }),
      ),
      storage: await createReadyStorage(),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await vi.runAllTimersAsync();

    expect((document.querySelector("#otp_area") as HTMLElement).style.display).toBe("");
    expect(document.activeElement?.id).toBe("otp_code");
    expect(window.oauthLogon).not.toHaveBeenCalled();
  });

  it("未绑定 OTP 时会提示用户而不会自动提交", async () => {
    vi.useFakeTimers();
    mountFixture();
    const loginButton = document.querySelector<HTMLButtonElement>("#logon_button");
    const clickSpy = vi.spyOn(loginButton!, "click");

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn().mockResolvedValue(
        createJsonResponse({ success: true, isMobileAuthen: true, authenMode: "OTP", isBind: false }),
      ),
      storage: await createReadyStorage(),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await vi.runAllTimersAsync();

    expect((document.querySelector("#msg") as HTMLElement).textContent).toContain("绑定手机 App");
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("认证探测失败时会回退到按钮点击登录", async () => {
    vi.useFakeTimers();
    mountFixture();

    const loginButton = document.querySelector<HTMLButtonElement>("#logon_button");
    const clickSpy = vi.spyOn(loginButton!, "click");

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn().mockRejectedValue(new Error("network")),
      storage: await createReadyStorage(),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await vi.runAllTimersAsync();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("自动登录关闭或设备未解锁时不会填写页面", async () => {
    mountFixture();
    const disabledStorage = await createReadyStorage(false);
    const passwordCrypto = new PasswordCrypto();
    const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
    const { chromeLike } = createMockChrome({
      sync: {
        settings: {
          version: 1,
          username: "2400012345",
          autoLoginEnabled: true,
          encryptedPassword: bundle.encryptedPassword,
          salt: bundle.salt,
          iv: bundle.iv,
        },
      },
    });

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn(),
      storage: disabledStorage,
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    await runAutoLogin({
      viewDocument: document,
      viewWindow: window,
      fetcher: vi.fn(),
      storage: new ExtensionStorageService(chromeLike),
      passwordCrypto: new PasswordCrypto(),
      logger: createLogger(),
    });

    expect((document.querySelector("#user_name") as HTMLInputElement).value).toBe("");
    expect((document.querySelector("#password") as HTMLInputElement).value).toBe("");
  });
});
