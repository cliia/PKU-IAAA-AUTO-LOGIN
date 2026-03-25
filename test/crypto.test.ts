import { PasswordCrypto } from "../src/shared/crypto";
import type { SyncSettings } from "../src/shared/types";

describe("PasswordCrypto", () => {
  it("可以用主密码加密并通过缓存密钥解密", async () => {
    const passwordCrypto = new PasswordCrypto();
    const bundle = await passwordCrypto.encryptWithMasterPassword("secret-password", "master-pass");
    const decrypted = await passwordCrypto.decryptWithKey(
      bundle.encryptedPassword,
      bundle.iv,
      bundle.cachedKeyJwk,
    );

    expect(decrypted).toBe("secret-password");
  });

  it("可以验证正确主密码并拒绝错误主密码", async () => {
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

    const cachedKey = await passwordCrypto.verifyMasterPassword("master-pass", settings);
    const decrypted = await passwordCrypto.decryptWithKey(bundle.encryptedPassword, bundle.iv, cachedKey);

    expect(decrypted).toBe("secret-password");
    await expect(passwordCrypto.verifyMasterPassword("wrong-pass", settings)).rejects.toThrow();
  });
});
