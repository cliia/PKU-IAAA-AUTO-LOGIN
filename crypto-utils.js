class PasswordCrypto {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.ivLength = 12; // 96 bits for GCM
    }

    /**
     * 生成或获取加密密钥
     * @returns {Promise<CryptoKey>}
     */
    async getOrCreateKey() {
        try {
            // 尝试从存储中获取已有的密钥
            const stored = await new Promise((resolve) => {
                chrome.storage.local.get(['_cryptoKey'], (result) => {
                    resolve(result._cryptoKey);
                });
            });

            if (stored) {
                // 从存储的 JWK 格式恢复密钥
                return await crypto.subtle.importKey(
                    'jwk',
                    stored,
                    { name: this.algorithm, length: this.keyLength },
                    true,
                    ['encrypt', 'decrypt']
                );
            } else {
                // 生成新密钥
                const key = await crypto.subtle.generateKey(
                    { name: this.algorithm, length: this.keyLength },
                    true,
                    ['encrypt', 'decrypt']
                );

                // 导出并存储密钥
                const keyData = await crypto.subtle.exportKey('jwk', key);
                chrome.storage.local.set({ '_cryptoKey': keyData });
                
                return key;
            }
        } catch (error) {
            console.error('Failed to generate or retrieve key:', error);
            throw new Error('加密密钥初始化失败');
        }
    }

    /**
     * 加密密码
     * @param {string} password - 要加密的密码
     * @returns {Promise<string>} 加密后的密码（Base64编码）
     */
    async encryptPassword(password) {
        try {
            const key = await this.getOrCreateKey();
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            
            // 生成随机 IV
            const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            // 加密
            const encrypted = await crypto.subtle.encrypt(
                { name: this.algorithm, iv: iv },
                key,
                data
            );

            // 将 IV 和加密数据合并并转换为 Base64
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);
            
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('Password encryption failed:', error);
            throw new Error('密码加密失败');
        }
    }

    /**
     * 解密密码
     * @param {string} encryptedPassword - 加密的密码（Base64编码）
     * @returns {Promise<string>} 解密后的密码
     */
    async decryptPassword(encryptedPassword) {
        try {
            const key = await this.getOrCreateKey();
            
            // 从 Base64 解码
            const combined = new Uint8Array(
                atob(encryptedPassword).split('').map(c => c.charCodeAt(0))
            );
            
            // 分离 IV 和加密数据
            const iv = combined.slice(0, this.ivLength);
            const encrypted = combined.slice(this.ivLength);
            
            // 解密
            const decrypted = await crypto.subtle.decrypt(
                { name: this.algorithm, iv: iv },
                key,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Password decryption failed:', error);
            throw new Error('密码解密失败');
        }
    }

    /**
     * 检查是否为加密的密码格式
     * @param {string} value - 要检查的值
     * @returns {boolean}
     */
    isEncrypted(value) {
        if (!value || typeof value !== 'string') return false;
        
        // 检查是否为有效的 Base64 格式且长度合理
        try {
            const decoded = atob(value);
            return decoded.length > this.ivLength; // 至少要有 IV + 一些数据
        } catch {
            return false;
        }
    }
}

// 创建全局加密实例（如果在浏览器环境中）
if (typeof window !== 'undefined') {
    window.passwordCrypto = new PasswordCrypto();
}