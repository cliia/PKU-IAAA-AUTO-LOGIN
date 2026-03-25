import { LOGIN_FORM_TIMEOUT_MS } from "../shared/constants";
import { LOGIN_BUTTON_PATTERN, LOGIN_BUTTON_SELECTORS, SEND_CODE_BUTTON_PATTERN, IAAA_SELECTORS } from "../shared/selectors";
import type { PasswordCrypto } from "../shared/crypto";
import type { ExtensionStorageService } from "../shared/storage";
import type { AuthCheckResponse, AuthMode } from "../shared/types";

interface LoginFormElements {
  userNameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
}

export interface AutoLoginDependencies {
  viewDocument: Document;
  viewWindow: Window;
  fetcher: typeof fetch;
  storage: ExtensionStorageService;
  passwordCrypto: PasswordCrypto;
  logger: Pick<Console, "log" | "warn" | "error">;
}

export async function runAutoLogin({
  viewDocument,
  viewWindow,
  fetcher,
  storage,
  passwordCrypto,
  logger,
}: AutoLoginDependencies): Promise<void> {
  const [settings, device] = await Promise.all([
    storage.getSyncSettings(),
    storage.getLocalDeviceSession(),
  ]);

  if (!settings || !settings.autoLoginEnabled) {
    logger.log("自动登录未启用或未配置。");
    return;
  }

  if (!device.cachedKeyJwk) {
    logger.log("当前设备未解锁，跳过自动登录。");
    return;
  }

  let password: string;

  try {
    password = await passwordCrypto.decryptWithKey(settings.encryptedPassword, settings.iv, device.cachedKeyJwk);
  } catch (error) {
    logger.warn("无法解密当前设备上的已保存密码，跳过自动登录。", error);
    return;
  }

  const formElements = await waitForLoginForm(viewDocument, viewWindow);

  if (!formElements) {
    logger.warn("未在页面中找到 IAAA 登录表单。");
    return;
  }

  fillCredentials(formElements, settings.username, password);

  let authMode: AuthMode = "normal";

  try {
    authMode = await resolveAuthMode(viewDocument, fetcher, settings.username);
  } catch (error) {
    logger.warn("认证模式探测失败，将回退到普通登录。", error);
  }

  await handleAuthMode(authMode, viewDocument, viewWindow, logger);
}

async function waitForLoginForm(viewDocument: Document, viewWindow: Window): Promise<LoginFormElements | null> {
  return new Promise((resolve) => {
    const resolveIfReady = (): boolean => {
      const userNameInput = viewDocument.querySelector<HTMLInputElement>(IAAA_SELECTORS.userName);
      const passwordInput = viewDocument.querySelector<HTMLInputElement>(IAAA_SELECTORS.password);

      if (!userNameInput || !passwordInput) {
        return false;
      }

      cleanup();
      resolve({ userNameInput, passwordInput });
      return true;
    };

    const observer = new MutationObserver(() => {
      resolveIfReady();
    });

    const timeoutId = viewWindow.setTimeout(() => {
      cleanup();
      resolve(null);
    }, LOGIN_FORM_TIMEOUT_MS);

    const cleanup = (): void => {
      observer.disconnect();
      viewWindow.clearTimeout(timeoutId);
    };

    if (resolveIfReady()) {
      return;
    }

    observer.observe(viewDocument.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function fillCredentials(formElements: LoginFormElements, username: string, password: string): void {
  formElements.userNameInput.value = username;
  formElements.passwordInput.value = password;

  for (const element of [formElements.userNameInput, formElements.passwordInput]) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function resolveAuthMode(
  viewDocument: Document,
  fetcher: typeof fetch,
  username: string,
): Promise<AuthMode> {
  const appId = viewDocument.querySelector<HTMLInputElement>(IAAA_SELECTORS.appId)?.value;

  if (!appId) {
    return "normal";
  }

  const origin = viewDocument.location?.origin && viewDocument.location.origin !== "null"
    ? viewDocument.location.origin
    : "https://iaaa.pku.edu.cn";
  const url = new URL("/iaaa/isMobileAuthen.do", origin);
  url.searchParams.set("userName", username);
  url.searchParams.set("appId", appId);
  url.searchParams.set("_rand", Math.random().toString());

  const response = await fetcher(url.toString(), {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`认证探测请求失败，状态码 ${response.status}`);
  }

  const data = (await response.json()) as AuthCheckResponse;

  if (!data.success || data.isMobileAuthen !== true) {
    return "normal";
  }

  if (data.authenMode === "SMS") {
    return "sms";
  }

  if (data.authenMode === "OTP") {
    return data.isBind === false ? "otp-unbound" : "otp";
  }

  return "normal";
}

async function handleAuthMode(
  authMode: AuthMode,
  viewDocument: Document,
  viewWindow: Window,
  logger: Pick<Console, "warn">,
): Promise<void> {
  switch (authMode) {
    case "sms":
      showElement(viewDocument, IAAA_SELECTORS.smsArea);
      hideElement(viewDocument, IAAA_SELECTORS.otpArea);
      hideElement(viewDocument, IAAA_SELECTORS.otpButton);
      showElement(viewDocument, IAAA_SELECTORS.logonButton);
      triggerSmsCode(viewDocument, viewWindow, logger);
      focusLater(viewDocument, viewWindow, IAAA_SELECTORS.smsCode, 300);
      return;
    case "otp":
      hideElement(viewDocument, IAAA_SELECTORS.smsArea);
      showElement(viewDocument, IAAA_SELECTORS.otpArea);
      hideElement(viewDocument, IAAA_SELECTORS.otpButton);
      showElement(viewDocument, IAAA_SELECTORS.logonButton);
      focusLater(viewDocument, viewWindow, IAAA_SELECTORS.otpCode, 200);
      return;
    case "otp-unbound":
      hideElement(viewDocument, IAAA_SELECTORS.smsArea);
      showElement(viewDocument, IAAA_SELECTORS.otpArea);
      showElement(viewDocument, IAAA_SELECTORS.otpButton);
      hideElement(viewDocument, IAAA_SELECTORS.logonButton);
      setText(viewDocument, IAAA_SELECTORS.message, "请先绑定手机 App 后再使用 OTP 登录。");
      return;
    case "normal":
    default:
      hideElement(viewDocument, IAAA_SELECTORS.smsArea);
      hideElement(viewDocument, IAAA_SELECTORS.otpArea);
      hideElement(viewDocument, IAAA_SELECTORS.otpButton);
      showElement(viewDocument, IAAA_SELECTORS.logonButton);
      viewWindow.setTimeout(() => {
        submitLogin(viewDocument, viewWindow);
      }, 120);
  }
}

function triggerSmsCode(
  viewDocument: Document,
  viewWindow: Window,
  logger: Pick<Console, "warn">,
): void {
  if (typeof viewWindow.sendSMSCode === "function") {
    viewWindow.sendSMSCode();
    return;
  }

  const candidates = Array.from(
    viewDocument.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"], a, .btn'),
  );

  const trigger = candidates.find((element) => {
    const label = (element.innerText || element.textContent || (element as HTMLInputElement).value || "").trim();
    return SEND_CODE_BUTTON_PATTERN.test(label);
  });

  if (!trigger) {
    logger.warn("未找到发送验证码按钮。");
    return;
  }

  trigger.click();
}

function submitLogin(viewDocument: Document, viewWindow: Window): void {
  if (typeof viewWindow.oauthLogon === "function") {
    viewWindow.oauthLogon();
    return;
  }

  const selectorHit = LOGIN_BUTTON_SELECTORS
    .map((selector) => viewDocument.querySelector<HTMLElement>(selector))
    .find((element) => element && isVisible(element) && !isDisabled(element));

  if (selectorHit) {
    selectorHit.click();
    return;
  }

  const allButtons = Array.from(
    viewDocument.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"], .btn'),
  );

  const matchedButton = allButtons.find((element) => {
    if (!isVisible(element) || isDisabled(element)) {
      return false;
    }

    const label = (element.innerText || element.textContent || (element as HTMLInputElement).value || "").trim();
    return LOGIN_BUTTON_PATTERN.test(label);
  });

  matchedButton?.click();
}

function isVisible(element: HTMLElement): boolean {
  const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element);

  if (!computedStyle) {
    return !element.hidden;
  }

  return computedStyle.display !== "none" && computedStyle.visibility !== "hidden" && !element.hidden;
}

function isDisabled(element: HTMLElement): boolean {
  return "disabled" in element && Boolean((element as HTMLButtonElement | HTMLInputElement).disabled);
}

function showElement(viewDocument: Document, selector: string): void {
  const element = viewDocument.querySelector<HTMLElement>(selector);

  if (element) {
    element.style.display = "";
  }
}

function hideElement(viewDocument: Document, selector: string): void {
  const element = viewDocument.querySelector<HTMLElement>(selector);

  if (element) {
    element.style.display = "none";
  }
}

function setText(viewDocument: Document, selector: string, text: string): void {
  const element = viewDocument.querySelector<HTMLElement>(selector);

  if (element) {
    element.textContent = text;
  }
}

function focusLater(viewDocument: Document, viewWindow: Window, selector: string, delayMs: number): void {
  viewWindow.setTimeout(() => {
    viewDocument.querySelector<HTMLElement>(selector)?.focus();
  }, delayMs);
}
