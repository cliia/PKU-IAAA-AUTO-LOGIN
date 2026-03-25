import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { afterEach } from "vitest";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

if (!globalThis.TextEncoder) {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
}

if (!globalThis.TextDecoder) {
  Object.defineProperty(globalThis, "TextDecoder", {
    value: TextDecoder,
    configurable: true,
  });
}

if (!globalThis.btoa) {
  Object.defineProperty(globalThis, "btoa", {
    value: (value: string) => Buffer.from(value, "binary").toString("base64"),
    configurable: true,
  });
}

if (!globalThis.atob) {
  Object.defineProperty(globalThis, "atob", {
    value: (value: string) => Buffer.from(value, "base64").toString("binary"),
    configurable: true,
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  delete window.oauthLogon;
  delete window.sendSMSCode;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
