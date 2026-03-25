import { PasswordCrypto } from "../shared/crypto";
import { ExtensionStorageService, getExtensionChrome } from "../shared/storage";
import { runAutoLogin } from "./runner";

void runAutoLogin({
  viewDocument: document,
  viewWindow: window,
  fetcher: fetch,
  storage: new ExtensionStorageService(getExtensionChrome()),
  passwordCrypto: new PasswordCrypto(),
  logger: console,
});
