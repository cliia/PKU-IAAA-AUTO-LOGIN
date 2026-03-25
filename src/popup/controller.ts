import { MASTER_PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH } from "../shared/constants";
import type { PasswordCrypto } from "../shared/crypto";
import type { ExtensionStorageService } from "../shared/storage";
import type {
  LegacyStorageSnapshot,
  LocalDeviceSession,
  MessageTone,
  PopupState,
  SyncSettings,
} from "../shared/types";
import { popupTemplate } from "./template";

interface PopupElements {
  form: HTMLFormElement;
  statusBanner: HTMLElement;
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  masterPasswordInput: HTMLInputElement;
  togglePasswordButton: HTMLButtonElement;
  autoLoginToggle: HTMLInputElement;
  submitButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  message: HTMLElement;
}

export class PopupController {
  private state: PopupState = "setup";
  private currentSettings: SyncSettings | null = null;
  private currentDevice: LocalDeviceSession = { cachedKeyJwk: null };
  private legacySnapshot: LegacyStorageSnapshot = {
    hasLegacySyncData: false,
    hasLegacyLocalData: false,
    hasAnyLegacyData: false,
  };
  private autoLoginEnabled = true;
  private isBusy = false;
  private busyButtonText: string | null = null;
  private elements!: PopupElements;

  constructor(
    private readonly root: HTMLElement,
    private readonly storage: ExtensionStorageService,
    private readonly passwordCrypto: PasswordCrypto,
    private readonly viewDocument: Document = document,
  ) {}

  async init(): Promise<void> {
    this.root.innerHTML = popupTemplate;
    this.elements = this.collectElements();
    this.bindEvents();
    await this.refreshState();
  }

  private collectElements(): PopupElements {
    return {
      form: this.getRequiredElement<HTMLFormElement>("#popupForm"),
      statusBanner: this.getRequiredElement("#statusBanner"),
      usernameInput: this.getRequiredElement<HTMLInputElement>("#usernameInput"),
      passwordInput: this.getRequiredElement<HTMLInputElement>("#passwordInput"),
      masterPasswordInput: this.getRequiredElement<HTMLInputElement>("#masterPasswordInput"),
      togglePasswordButton: this.getRequiredElement<HTMLButtonElement>("#togglePasswordButton"),
      autoLoginToggle: this.getRequiredElement<HTMLInputElement>("#autoLoginToggle"),
      submitButton: this.getRequiredElement<HTMLButtonElement>("#submitButton"),
      clearButton: this.getRequiredElement<HTMLButtonElement>("#clearButton"),
      message: this.getRequiredElement("#message"),
    };
  }

  private bindEvents(): void {
    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handlePrimaryAction();
    });

    this.elements.clearButton.addEventListener("click", () => {
      void this.handleClear();
    });

    this.elements.autoLoginToggle.addEventListener("change", () => {
      void this.handleAutoLoginToggle();
    });

    this.elements.togglePasswordButton.addEventListener("click", () => {
      const shouldShow = this.elements.passwordInput.type === "password";
      this.elements.passwordInput.type = shouldShow ? "text" : "password";
      this.elements.togglePasswordButton.textContent = shouldShow ? "隐藏" : "显示";
    });
  }

  private async refreshState(message?: { tone: MessageTone; text: string }): Promise<void> {
    this.currentSettings = await this.storage.getSyncSettings();
    this.currentDevice = await this.storage.getLocalDeviceSession();
    this.legacySnapshot = await this.storage.detectLegacyStorage();
    this.autoLoginEnabled = this.currentSettings?.autoLoginEnabled ?? this.autoLoginEnabled;

    let followUpMessage = message;

    if (!this.currentSettings) {
      this.state = "setup";
    } else if (this.currentDevice.cachedKeyJwk) {
      try {
        await this.passwordCrypto.decryptWithKey(
          this.currentSettings.encryptedPassword,
          this.currentSettings.iv,
          this.currentDevice.cachedKeyJwk,
        );
        this.state = "ready";
      } catch {
        await this.storage.saveLocalDeviceSession(null);
        this.currentDevice = { cachedKeyJwk: null };
        this.state = "locked";
        followUpMessage = {
          tone: "warning",
          text: "本地解锁信息已失效，请重新输入主密码解锁。",
        };
      }
    } else {
      this.state = "locked";
    }

    this.render();

    if (followUpMessage) {
      this.showMessage(followUpMessage.text, followUpMessage.tone);
    } else {
      this.hideMessage();
    }
  }

  private render(): void {
    const {
      usernameInput,
      passwordInput,
      masterPasswordInput,
      autoLoginToggle,
      submitButton,
      clearButton,
    } = this.elements;

    const hasStoredData = Boolean(this.currentSettings);
    const hasLegacyOnly = !hasStoredData && this.legacySnapshot.hasAnyLegacyData;

    usernameInput.value = this.currentSettings?.username ?? "";
    autoLoginToggle.checked = this.currentSettings?.autoLoginEnabled ?? this.autoLoginEnabled;

    usernameInput.disabled = this.isBusy || this.state === "locked";
    passwordInput.disabled = this.isBusy || this.state === "locked";
    masterPasswordInput.disabled = this.isBusy;
    autoLoginToggle.disabled = this.isBusy;
    clearButton.disabled = this.isBusy || (!hasStoredData && !hasLegacyOnly);
    submitButton.disabled = this.isBusy;

    passwordInput.value = "";
    masterPasswordInput.value = "";
    passwordInput.type = "password";
    this.elements.togglePasswordButton.textContent = "显示";

    switch (this.state) {
      case "setup":
        submitButton.textContent = this.busyButtonText ?? "保存配置";
        passwordInput.placeholder = "请输入 IAAA 密码";
        masterPasswordInput.placeholder = "设置主密码（至少 6 位）";
        this.renderBanner(hasLegacyOnly);
        break;
      case "locked":
        submitButton.textContent = this.busyButtonText ?? "解锁";
        passwordInput.placeholder = "当前设备已锁定";
        masterPasswordInput.placeholder = "输入主密码以解锁";
        this.renderBanner(true, "设备已锁定，仅输入主密码即可恢复自动登录。");
        break;
      case "ready":
        submitButton.textContent = this.busyButtonText ?? "更新配置";
        passwordInput.placeholder = "留空表示保持当前 IAAA 密码";
        masterPasswordInput.placeholder = "留空表示保持当前主密码";
        this.renderBanner(false, "当前设备已解锁，可以更新配置或临时关闭自动登录。");
        break;
    }
  }

  private renderBanner(forceVisible: boolean, explicitText?: string): void {
    const { statusBanner } = this.elements;

    if (explicitText) {
      statusBanner.hidden = false;
      statusBanner.textContent = explicitText;
      statusBanner.dataset.tone = this.state === "locked" ? "warning" : "info";
      return;
    }

    if (forceVisible && this.legacySnapshot.hasAnyLegacyData && !this.currentSettings) {
      statusBanner.hidden = false;
      statusBanner.dataset.tone = "warning";
      statusBanner.textContent = "检测到旧版存储结构。v3 不会迁移旧数据，请重新配置或先清除旧数据。";
      return;
    }

    statusBanner.hidden = true;
    statusBanner.textContent = "";
    statusBanner.dataset.tone = "info";
  }

  private async handlePrimaryAction(): Promise<void> {
    if (this.state === "locked") {
      await this.handleUnlock();
      return;
    }

    await this.handleSave();
  }

  private async handleUnlock(): Promise<void> {
    if (!this.currentSettings) {
      await this.refreshState({
        tone: "warning",
        text: "当前没有可解锁的配置，请重新保存账号密码。",
      });
      return;
    }

    const masterPassword = this.elements.masterPasswordInput.value;

    if (!masterPassword) {
      this.showMessage("请输入主密码。", "warning");
      this.elements.masterPasswordInput.focus();
      return;
    }

    await this.runBusyAction("验证中...", async () => {
      const cachedKeyJwk = await this.passwordCrypto.verifyMasterPassword(masterPassword, this.currentSettings as SyncSettings);
      await this.storage.saveLocalDeviceSession({ cachedKeyJwk });
      await this.refreshState({
        tone: "success",
        text: "设备已解锁，后续可直接自动登录。",
      });
    });
  }

  private async handleSave(): Promise<void> {
    const username = this.elements.usernameInput.value.trim();
    const password = this.elements.passwordInput.value;
    const masterPassword = this.elements.masterPasswordInput.value;
    const autoLoginEnabled = this.elements.autoLoginToggle.checked;

    if (!username) {
      this.showMessage("请输入用户名。", "warning");
      this.elements.usernameInput.focus();
      return;
    }

    if (!this.currentSettings) {
      if (!password) {
        this.showMessage("首次配置必须填写 IAAA 密码。", "warning");
        this.elements.passwordInput.focus();
        return;
      }

      if (!masterPassword) {
        this.showMessage("首次配置必须设置主密码。", "warning");
        this.elements.masterPasswordInput.focus();
        return;
      }

      if (password.length < PASSWORD_MIN_LENGTH) {
        this.showMessage(`IAAA 密码长度不能少于 ${PASSWORD_MIN_LENGTH} 位。`, "warning");
        this.elements.passwordInput.focus();
        return;
      }

      if (masterPassword.length < MASTER_PASSWORD_MIN_LENGTH) {
        this.showMessage(`主密码长度不能少于 ${MASTER_PASSWORD_MIN_LENGTH} 位。`, "warning");
        this.elements.masterPasswordInput.focus();
        return;
      }

      await this.runBusyAction("加密保存中...", async () => {
        const bundle = await this.passwordCrypto.encryptWithMasterPassword(password, masterPassword);
        const settings: SyncSettings = {
          version: 1,
          username,
          autoLoginEnabled,
          encryptedPassword: bundle.encryptedPassword,
          salt: bundle.salt,
          iv: bundle.iv,
        };

        await Promise.all([
          this.storage.saveSyncSettings(settings),
          this.storage.saveLocalDeviceSession({ cachedKeyJwk: bundle.cachedKeyJwk }),
        ]);

        await this.refreshState({
          tone: "success",
          text: autoLoginEnabled ? "配置已保存，自动登录已启用。" : "配置已保存，自动登录当前处于关闭状态。",
        });
      });
      return;
    }

    if (password && password.length < PASSWORD_MIN_LENGTH) {
      this.showMessage(`IAAA 密码长度不能少于 ${PASSWORD_MIN_LENGTH} 位。`, "warning");
      this.elements.passwordInput.focus();
      return;
    }

    if (masterPassword && masterPassword.length < MASTER_PASSWORD_MIN_LENGTH) {
      this.showMessage(`主密码长度不能少于 ${MASTER_PASSWORD_MIN_LENGTH} 位。`, "warning");
      this.elements.masterPasswordInput.focus();
      return;
    }

    await this.runBusyAction("更新配置中...", async () => {
      const nextSettings: SyncSettings = {
        ...this.currentSettings!,
        username,
        autoLoginEnabled,
      };

      let nextDevice = this.currentDevice;

      if (masterPassword) {
        const passwordToEncrypt = password || (await this.getCurrentPassword());
        const bundle = await this.passwordCrypto.encryptWithMasterPassword(passwordToEncrypt, masterPassword);
        nextSettings.encryptedPassword = bundle.encryptedPassword;
        nextSettings.salt = bundle.salt;
        nextSettings.iv = bundle.iv;
        nextDevice = { cachedKeyJwk: bundle.cachedKeyJwk };
      } else if (password) {
        if (!this.currentDevice.cachedKeyJwk) {
          throw new Error("当前设备未解锁，无法在不输入主密码的情况下更新 IAAA 密码。");
        }

        const reEncrypted = await this.passwordCrypto.encryptWithKey(password, this.currentDevice.cachedKeyJwk);
        nextSettings.encryptedPassword = reEncrypted.encryptedPassword;
        nextSettings.iv = reEncrypted.iv;
      }

      await Promise.all([
        this.storage.saveSyncSettings(nextSettings),
        this.storage.saveLocalDeviceSession(nextDevice),
      ]);

      await this.refreshState({
        tone: "success",
        text: autoLoginEnabled ? "配置已更新。" : "配置已更新，自动登录当前已关闭。",
      });
    });
  }

  private async getCurrentPassword(): Promise<string> {
    if (!this.currentSettings?.encryptedPassword || !this.currentDevice.cachedKeyJwk) {
      throw new Error("当前设备未解锁，无法读取已保存密码。");
    }

    return this.passwordCrypto.decryptWithKey(
      this.currentSettings.encryptedPassword,
      this.currentSettings.iv,
      this.currentDevice.cachedKeyJwk,
    );
  }

  private async handleAutoLoginToggle(): Promise<void> {
    this.autoLoginEnabled = this.elements.autoLoginToggle.checked;

    if (!this.currentSettings) {
      return;
    }

    const previousValue = this.currentSettings.autoLoginEnabled;

    try {
      const nextSettings: SyncSettings = {
        ...this.currentSettings,
        autoLoginEnabled: this.autoLoginEnabled,
      };

      await this.storage.saveSyncSettings(nextSettings);
      this.currentSettings = nextSettings;
      this.showMessage(this.autoLoginEnabled ? "自动登录已启用。" : "自动登录已关闭。", "info");
    } catch (error) {
      this.autoLoginEnabled = previousValue;
      this.elements.autoLoginToggle.checked = previousValue;
      this.showMessage(this.toUserMessage(error, "切换自动登录失败。"), "error");
    }
  }

  private async handleClear(): Promise<void> {
    const confirmed = this.viewDocument.defaultView?.confirm("确定要清除所有保存配置吗？") ?? false;

    if (!confirmed) {
      return;
    }

    await this.runBusyAction("清除中...", async () => {
      await this.storage.clearAllData();
      this.currentSettings = null;
      this.currentDevice = { cachedKeyJwk: null };
      this.legacySnapshot = {
        hasLegacySyncData: false,
        hasLegacyLocalData: false,
        hasAnyLegacyData: false,
      };
      this.autoLoginEnabled = true;
      this.state = "setup";
      this.render();
      this.showMessage("已清除所有本地与同步配置。", "success");
    });
  }

  private async runBusyAction(buttonText: string, action: () => Promise<void>): Promise<void> {
    this.isBusy = true;
    this.busyButtonText = buttonText;
    this.render();

    try {
      await action();
    } catch (error) {
      this.showMessage(this.toUserMessage(error, "操作失败，请稍后重试。"), "error");
    } finally {
      this.isBusy = false;
      this.busyButtonText = null;
      this.render();
    }
  }

  private showMessage(text: string, tone: MessageTone): void {
    this.elements.message.hidden = false;
    this.elements.message.textContent = text;
    this.elements.message.dataset.tone = tone;
  }

  private hideMessage(): void {
    this.elements.message.hidden = true;
    this.elements.message.textContent = "";
    this.elements.message.dataset.tone = "info";
  }

  private toUserMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  private getRequiredElement<TElement extends HTMLElement>(selector: string): TElement {
    const element = this.root.querySelector<TElement>(selector);

    if (!element) {
      throw new Error(`缺少必要的界面元素: ${selector}`);
    }

    return element;
  }
}
