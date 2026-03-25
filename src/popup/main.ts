import "./styles.css";
import { PasswordCrypto } from "../shared/crypto";
import { ExtensionStorageService, getExtensionChrome } from "../shared/storage";
import { PopupController } from "./controller";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");

  if (!root) {
    throw new Error("找不到 popup 挂载节点。");
  }

  const popupController = new PopupController(
    root,
    new ExtensionStorageService(getExtensionChrome()),
    new PasswordCrypto(),
  );

  await popupController.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootstrap();
  });
} else {
  void bootstrap();
}
