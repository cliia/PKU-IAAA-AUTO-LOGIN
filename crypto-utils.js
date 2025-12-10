class PasswordCrypto {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.pbkdf2Iterations = 100000;
        this.saltLength = 16;
        this.ivLength = 12;
    }

    /**
     * 将主密码转换为密钥
     * @param {string} masterPassword - 主密码
     * @param {Uint8Array} salt - 盐值
     * @returns {Promise<CryptoKey>}
     */
    async deriveKey(masterPassword, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(masterPassword),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: this.pbkdf2Iterations,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: this.keyLength },
            true, // Exportable for local storage caching
            ["encrypt", "decrypt"]
        );
    }

    /**
     * 生成新的盐值
     */
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(this.saltLength));
    }

    /**
     * 使用主密码加密数据
     * @param {string} password - 要加密的真实密码
     * @param {string} masterPassword - 主密码
     * @returns {Promise<Object>} 包含加密数据、盐值和IV的对象
     */
    async encryptWithMasterPassword(password, masterPassword) {
        try {
            const salt = this.generateSalt();
            const key = await this.deriveKey(masterPassword, salt);
            const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            const encoder = new TextEncoder();
            const encrypted = await crypto.subtle.encrypt(
                { name: this.algorithm, iv: iv },
                key,
                encoder.encode(password)
            );

            // Export key for local caching
            const keyJwk = await crypto.subtle.exportKey("jwk", key);

            return {
                encryptedData: this.arrayBufferToBase64(encrypted),
                salt: this.arrayBufferToBase64(salt),
                iv: this.arrayBufferToBase64(iv),
                keyJwk: keyJwk
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('加密失败');
        }
    }

    /**
     * 尝试使用缓存的密钥解密
     * @param {string} encryptedDataB64
     * @param {string} ivB64
     * @param {Object} keyJwk
     */
    async decryptWithKey(encryptedDataB64, ivB64, keyJwk) {
        try {
            const key = await crypto.subtle.importKey(
                "jwk",
                keyJwk,
                { name: this.algorithm, length: this.keyLength },
                true,
                ["encrypt", "decrypt"]
            );

            const encryptedData = this.base64ToArrayBuffer(encryptedDataB64);
            const iv = this.base64ToArrayBuffer(ivB64);

            const decrypted = await crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                key,
                encryptedData
            );

            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('解密失败');
        }
    }

    /**
     * 验证主密码并获取密钥 (用于解锁)
     */
    async verifyAndDeriveKey(masterPassword, saltB64, encryptedDataB64, ivB64) {
        try {
            const salt = this.base64ToArrayBuffer(saltB64);
            const key = await this.deriveKey(masterPassword, salt);

            // 尝试解密以验证密码正确性
            const iv = this.base64ToArrayBuffer(ivB64);
            const encryptedData = this.base64ToArrayBuffer(encryptedDataB64);

            await crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                key,
                encryptedData
            );

            // 如果解密成功，返回key的JWK格式以便缓存
            return await crypto.subtle.exportKey("jwk", key);
        } catch (error) {
            throw new Error('主密码错误');
        }
    }

    // 辅助函数
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.passwordCrypto = new PasswordCrypto();
}
