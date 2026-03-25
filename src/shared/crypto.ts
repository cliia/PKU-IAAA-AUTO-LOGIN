import { CRYPTO_CONFIG } from "./constants";
import type { EncryptionBundle, ReEncryptedPassword, SyncSettings } from "./types";

export class PasswordCrypto {
  private readonly textEncoder = new TextEncoder();
  private readonly textDecoder = new TextDecoder();

  async encryptWithMasterPassword(password: string, masterPassword: string): Promise<EncryptionBundle> {
    const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.saltLength));
    const derivedKey = await this.deriveKey(masterPassword, salt);
    const cachedKeyJwk = await crypto.subtle.exportKey("jwk", derivedKey);
    const { encryptedPassword, iv } = await this.encryptWithCryptoKey(password, derivedKey);

    return {
      encryptedPassword,
      salt: this.toBase64(salt),
      iv,
      cachedKeyJwk,
    };
  }

  async encryptWithKey(password: string, cachedKeyJwk: JsonWebKey): Promise<ReEncryptedPassword> {
    const key = await this.importKey(cachedKeyJwk);
    return this.encryptWithCryptoKey(password, key);
  }

  async decryptWithKey(encryptedPassword: string, iv: string, cachedKeyJwk: JsonWebKey): Promise<string> {
    const key = await this.importKey(cachedKeyJwk);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: CRYPTO_CONFIG.algorithm,
        iv: this.fromBase64(iv),
      },
      key,
      this.fromBase64(encryptedPassword),
    );

    return this.textDecoder.decode(decrypted);
  }

  async verifyMasterPassword(masterPassword: string, settings: SyncSettings): Promise<JsonWebKey> {
    const key = await this.deriveKey(masterPassword, this.fromBase64(settings.salt));

    await crypto.subtle.decrypt(
      {
        name: CRYPTO_CONFIG.algorithm,
        iv: this.fromBase64(settings.iv),
      },
      key,
      this.fromBase64(settings.encryptedPassword),
    );

    return crypto.subtle.exportKey("jwk", key);
  }

  private async deriveKey(masterPassword: string, salt: ArrayBuffer): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      this.textEncoder.encode(masterPassword),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: CRYPTO_CONFIG.pbkdf2Iterations,
      },
      keyMaterial,
      {
        name: CRYPTO_CONFIG.algorithm,
        length: CRYPTO_CONFIG.keyLength,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }

  private async importKey(cachedKeyJwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      "jwk",
      cachedKeyJwk,
      {
        name: CRYPTO_CONFIG.algorithm,
        length: CRYPTO_CONFIG.keyLength,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }

  private async encryptWithCryptoKey(password: string, key: CryptoKey): Promise<ReEncryptedPassword> {
    const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivLength));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: CRYPTO_CONFIG.algorithm,
        iv,
      },
      key,
      this.textEncoder.encode(password),
    );

    return {
      encryptedPassword: this.toBase64(new Uint8Array(encrypted)),
      iv: this.toBase64(iv),
    };
  }

  private toBase64(data: Uint8Array): string {
    let binary = "";

    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }

  private fromBase64(base64Value: string): ArrayBuffer {
    const binary = atob(base64Value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }
}
