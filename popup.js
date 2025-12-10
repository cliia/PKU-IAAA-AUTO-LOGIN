/**
 * 通用的按钮状态管理函数
 */
function setButtonState(button, loading, loadingText, normalText = null) {
    if (!button) return;
    
    if (loading) {
        button.disabled = true;
        button._originalValue = button._originalValue || button.value;
        button.value = loadingText;
    } else {
        button.disabled = false;
        button.value = normalText || button._originalValue || button.value;
    }
}

/**
 * 确保密码加密工具已初始化
 */
function ensurePasswordCrypto() {
    try {
        if (typeof window.passwordCrypto === 'undefined') {
            if (typeof PasswordCrypto === 'function') {
                window.passwordCrypto = new PasswordCrypto();
            }
        }
    } catch (e) {
        console.error('Failed to initialize PasswordCrypto:', e);
    }
}

/**
 * 显示状态消息
 */
function showMessage(message, type = "info", duration = 3000) {
    const resultDiv = document.getElementById("result");
    if (!resultDiv) return;
    
    const styles = {
        success: "background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;",
        error: "background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;",
        warning: "background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7;",
        info: "background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;"
    };
    
    resultDiv.style.cssText = styles[type] || styles.info;
    resultDiv.innerHTML = message;
    
    if (duration > 0) {
        setTimeout(() => {
            resultDiv.innerHTML = "";
            resultDiv.style.cssText = "";
        }, duration);
    }
}

/**
 * 更新状态指示器
 */
function updateStatusIndicator(status) {
    const indicator = document.getElementById("status-indicator");
    if (!indicator) return;

    if (status === "locked") {
        indicator.style.display = "block";
        indicator.style.backgroundColor = "#fff3cd";
        indicator.style.color = "#856404";
        indicator.innerHTML = "🔒 <strong>设备已锁定</strong><br>请输入主密码解锁自动登录";
    } else if (status === "unlocked") {
        indicator.style.display = "none";
    } else if (status === "setup") {
        indicator.style.display = "none";
    }
}

/**
 * 全局状态变量
 */
let currentState = "setup"; // "setup", "locked", "unlocked"
let syncedSalt = null;
let syncedEncryptedPassword = null;
let syncedIv = null;

/**
 * 初始化弹窗界面
 */
function initializePopup() {
    console.log("Initializing popup UI...");
    
    // 绑定事件处理器
    const saveButton = document.getElementById('clickme_save');
    const clearButton = document.getElementById('clickme_clear');
    const autoLoginCheckbox = document.getElementById("cb");
    
    if (saveButton) {
        saveButton.onclick = handleSaveOrUnlock;
    }
    
    if (clearButton) {
        clearButton.onclick = clearLogin;
    }
    
    if (autoLoginCheckbox) {
        autoLoginCheckbox.onclick = autoLoginToggleChange;
    }
    
    // 绑定密码显示/隐藏切换事件
    const togglePassword = document.getElementById('togglePassword');
    const iconEye = document.getElementById('iconEye');
    const iconEyeSlash = document.getElementById('iconEyeSlash');
    const passwordInput = document.getElementById('passwd');
    if (togglePassword && iconEye && iconEyeSlash && passwordInput) {
        const toggle = () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            iconEye.style.display = isPassword ? 'none' : '';
            iconEyeSlash.style.display = isPassword ? '' : 'none';
        };

        togglePassword.addEventListener('click', toggle);
    }
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const saveButton = document.getElementById('clickme_save');
            if (saveButton && !saveButton.disabled) {
                handleSaveOrUnlock();
            }
        }
    });
    
    // 加载并显示当前设置
    loadCurrentSettings();
}

// 确保在DOM完全加载后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePopup);
} else {
    initializePopup();
}

/**
 * 加载当前设置
 */
async function loadCurrentSettings() {
    ensurePasswordCrypto();

    chrome.storage.sync.get(["use_login", "username", "encrypted_password", "salt", "iv"], async function(syncItems) {
        chrome.storage.local.get(["cached_key"], async function(localItems) {

            const usernameInput = document.getElementById("username");
            const passwordInput = document.getElementById("passwd");
            const masterInput = document.getElementById("master_password");
            const saveButton = document.getElementById("clickme_save");
            const clearButton = document.getElementById("clickme_clear");
            const autoLoginCheckbox = document.getElementById("cb");

            // 设置自动登录开关
            if (autoLoginCheckbox) {
                autoLoginCheckbox.checked = (syncItems.use_login === "Y");
            }

            if (syncItems.username) {
                if (usernameInput) usernameInput.value = syncItems.username;

                // 启用清除按钮
                if (clearButton) {
                    clearButton.disabled = false;
                    clearButton.style.opacity = "1";
                }

                // 检查是否已在本地解锁
                if (localItems.cached_key) {
                    // === 已解锁状态 ===
                    console.log("State: Unlocked");
                    currentState = "unlocked";
                    updateStatusIndicator("unlocked");

                    if (saveButton) saveButton.value = "更新配置";
                    if (passwordInput) {
                        passwordInput.placeholder = "(已加密保存，如需修改请直接输入)";
                        // 尝试解密并填充（可选，为了安全也可以不填充）
                         try {
                             const decrypted = await window.passwordCrypto.decryptWithKey(
                                 syncItems.encrypted_password,
                                 syncItems.iv,
                                 localItems.cached_key
                             );
                             passwordInput.value = decrypted;
                         } catch (e) {
                             console.warn("Failed to decrypt for UI display:", e);
                         }
                    }
                    if (masterInput) masterInput.placeholder = "如需修改密码，请输入新主密码";

                } else {
                    // === 锁定状态 (需要主密码解锁) ===
                    console.log("State: Locked");
                    currentState = "locked";
                    updateStatusIndicator("locked");

                    // 保存同步数据以便后续解锁使用
                    syncedSalt = syncItems.salt;
                    syncedEncryptedPassword = syncItems.encrypted_password;
                    syncedIv = syncItems.iv;

                    if (saveButton) saveButton.value = "解锁";
                    if (usernameInput) usernameInput.disabled = true; // 锁定状态下不可修改用户名
                    if (passwordInput) {
                        passwordInput.value = "";
                        passwordInput.placeholder = "已锁定";
                        passwordInput.disabled = true;
                        document.getElementById("password-row").style.opacity = "0.5";
                    }
                    if (masterInput) {
                        masterInput.placeholder = "请输入主密码以解锁";
                        masterInput.focus();
                    }
                }
            } else {
                // === 初始设置状态 ===
                console.log("State: Setup");
                currentState = "setup";
                updateStatusIndicator("setup");
                if (clearButton) {
                    clearButton.disabled = true;
                    clearButton.style.opacity = "0.5";
                }
            }
        });
    });
}

/**
 * 处理保存或解锁按钮点击
 */
async function handleSaveOrUnlock() {
    if (currentState === "locked") {
        await handleUnlock();
    } else {
        await handleSave();
    }
}

/**
 * 处理解锁逻辑
 */
async function handleUnlock() {
    const masterInput = document.getElementById("master_password");
    const saveButton = document.getElementById("clickme_save");
    
    const masterPassword = masterInput.value;
    
    if (!masterPassword) {
        showMessage("请输入主密码", "warning");
        masterInput.focus();
        return;
    }
    
    setButtonState(saveButton, true, "验证中...");

    try {
        ensurePasswordCrypto();
        // 验证主密码并获取密钥
        const keyJwk = await window.passwordCrypto.verifyAndDeriveKey(
            masterPassword,
            syncedSalt,
            syncedEncryptedPassword,
            syncedIv
        );

        // 保存密钥到本地
        chrome.storage.local.set({ 'cached_key': keyJwk }, function() {
            setButtonState(saveButton, false, null, "更新配置");
            showMessage("解锁成功！", "success");

            // 刷新页面以进入解锁状态
            setTimeout(() => { location.reload(); }, 800);
        });

    } catch (error) {
        console.error("Unlock failed:", error);
        setButtonState(saveButton, false, null, "解锁");
        showMessage("主密码错误，请重试", "error");
    }
}

/**
 * 处理保存逻辑 (设置或更新)
 */
async function handleSave() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("passwd");
    const masterInput = document.getElementById("master_password");
    const saveButton = document.getElementById("clickme_save");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const masterPassword = masterInput.value;

    // 验证
    if (!username || !password) {
        showMessage("请输入用户名和密码", "warning");
        return;
    }

    if (!masterPassword) {
        showMessage("请设置主密码（用于跨设备同步）", "warning");
        masterInput.focus();
        return;
    }

    if (password.length < 6) {
        showMessage("密码长度不能少于6位", "warning");
        return;
    }

    setButtonState(saveButton, true, "加密保存中...");

    try {
        ensurePasswordCrypto();

        // 使用主密码加密
        const result = await window.passwordCrypto.encryptWithMasterPassword(password, masterPassword);

        // 保存到 Sync (加密数据) 和 Local (密钥)
        const syncData = {
            'username': username,
            'encrypted_password': result.encryptedData,
            'salt': result.salt,
            'iv': result.iv,
            'use_login': "Y"
        };

        // 清理旧格式数据 (如果有)
        chrome.storage.sync.remove(['password'], () => {});

        chrome.storage.sync.set(syncData, function() {
            if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
            }

            // 保存密钥到本地以便本机自动登录
            chrome.storage.local.set({ 'cached_key': result.keyJwk }, function() {
                setButtonState(saveButton, false, null, "更新配置");
                showMessage("配置已保存！自动登录已启用", "success");
                updateStatusIndicator("unlocked");
                currentState = "unlocked";

                // 启用清除按钮
                const clearButton = document.getElementById("clickme_clear");
                if (clearButton) {
                    clearButton.disabled = false;
                    clearButton.style.opacity = "1";
                }
            });
        });

    } catch (error) {
        console.error("Save failed:", error);
        setButtonState(saveButton, false, null, "保存");
        showMessage("保存失败: " + error.message, "error");
    }
}

/**
 * 清除登录信息
 */
function clearLogin() {
    if (!confirm("确定要清除所有保存的登录信息吗？这将清除云端同步的数据。")) {
        return;
    }
    
    const clearButton = document.getElementById("clickme_clear");
    setButtonState(clearButton, true, "清除中...");
    
    // 清除 Sync 和 Local 中的所有相关数据
    const syncKeys = ['username', 'password', 'encrypted_password', 'salt', 'iv'];
    const localKeys = ['cached_key']; // 不要清除 _cryptoKey 因为那是旧版本的，但也无所谓了

    chrome.storage.sync.set({ 'use_login': "N" }, function() {
        chrome.storage.sync.remove(syncKeys, function() {
            chrome.storage.local.remove(localKeys, function() {
                showMessage("登录信息已清除", "info");
                setTimeout(() => { location.reload(); }, 800);
            });
        });
    });
}

/**
 * 自动登录开关切换
 */
function autoLoginToggleChange() {
    const checkbox = document.getElementById("cb");
    if (!checkbox) return;
    
    const isEnabled = checkbox.checked;
    
    chrome.storage.sync.set({
        'use_login': isEnabled ? "Y" : "N"
    }, function() {
        const message = isEnabled ? "自动登录已启用" : "自动登录已关闭";
        showMessage(message, isEnabled ? "success" : "info");
    });
}
