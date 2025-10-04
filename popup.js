/**
 * 通用的按钮状态管理函数
 * @param {HTMLElement} button - 按钮元素
 * @param {boolean} loading - 是否处于加载状态
 * @param {string} loadingText - 加载时显示的文字
 * @param {string} normalText - 正常状态显示的文字(可选)
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
            // WebCrypto 可用性简单检查
            if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
                throw new Error('WebCrypto unavailable');
            }
            if (typeof PasswordCrypto === 'function') {
                window.passwordCrypto = new PasswordCrypto();
            }
        }
    } catch (e) {
        console.error('Failed to initialize PasswordCrypto:', e);
    }
}

/**
 * 显示状态消息（增强版）
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型: success, error, warning, info
 * @param {number} duration - 显示时间（毫秒）
 */
function showMessage(message, type = "info", duration = 3000) {
    const resultDiv = document.getElementById("result");
    if (!resultDiv) return;
    
    // 设置消息样式
    const styles = {
        success: "background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;",
        error: "background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;",
        warning: "background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7;",
        info: "background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;"
    };
    
    resultDiv.style.cssText = styles[type] || styles.info;
    resultDiv.innerHTML = message;
    
    // 自动清除消息
    if (duration > 0) {
        setTimeout(() => {
            resultDiv.innerHTML = "";
            resultDiv.style.cssText = "";
        }, duration);
    }
}

/**
 * 初始化弹窗界面
 */
function initializePopup() {
    console.log("Initializing popup UI...");
    
    // 绑定事件处理器
    const saveButton = document.getElementById('clickme_save');
    const clearButton = document.getElementById('clickme_clear');
    const autoLoginCheckbox = document.getElementById("cb");
    
    console.log("Elements found:", {
        saveButton: !!saveButton,
        clearButton: !!clearButton,
        autoLoginCheckbox: !!autoLoginCheckbox
    });
    
    if (saveButton) {
        saveButton.onclick = function() {
            console.log("Save button clicked.");
            saveConfig();
        };
        console.log("Save button handler attached, onclick:", saveButton.onclick);
    } else {
        console.error("Save button element not found.");
    }
    
    if (clearButton) {
        clearButton.onclick = clearLogin;
        console.log("Clear button handler attached.");
    } else {
        console.error("Clear button element not found.");
    }
    
    if (autoLoginCheckbox) {
        autoLoginCheckbox.onclick = autoLoginToggleChange;
        console.log("Auto-login toggle handler attached.");
    } else {
        console.error("Auto-login toggle element not found.");
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
            // 切换 SVG 显示
            iconEye.style.display = isPassword ? 'none' : '';
            iconEyeSlash.style.display = isPassword ? '' : 'none';
            // 无障碍提示
            togglePassword.title = isPassword ? '隐藏密码' : '显示密码';
            togglePassword.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
        };

        togglePassword.addEventListener('click', toggle);
        // 键盘可访问：Enter/Space 触发
        togglePassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                toggle();
            }
        });
        console.log("Password visibility toggle bound (SVG).");
    }
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', function(event) {
        // Ctrl+Enter 或 Cmd+Enter 快速保存
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            const saveButton = document.getElementById('clickme_save');
            if (saveButton && !saveButton.disabled) {
                saveConfig();
            }
        }
        
        // Enter键在密码框中触发保存
        if (event.key === 'Enter' && event.target.id === 'passwd') {
            event.preventDefault();
            const saveButton = document.getElementById('clickme_save');
            if (saveButton && !saveButton.disabled) {
                saveConfig();
            }
        }
    });
    
    // 加载并显示当前设置
    loadCurrentSettings();
    
    console.log("Popup UI initialized.");
}

// 确保在DOM完全加载后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePopup);
} else {
    // 如果DOM已经加载完成，直接初始化
    initializePopup();
}

/**
 * 加载当前设置并更新UI（支持密码解密显示和自动升级）
 */
async function loadCurrentSettings() {
    chrome.storage.sync.get(["use_login", "username"], async function(items) {
        if (chrome.runtime.lastError) {
            console.error("Failed to load settings:", chrome.runtime.lastError);
            showMessage("加载设置失败，请重试", "error");
            return;
        }
        console.log("Current settings:", { use_login: items.use_login, username: items.username });
        updateUIBasedOnSettings(items);
    });
}

/**
 * 升级现有明文密码为加密密码
 * @param {string} plainPassword - 明文密码
 * @param {string} username - 用户名
 * @param {string} useLogin - 登录状态
 */
// 取消历史版本明文密码升级逻辑（本版本从零开始，不存在升级场景）

/**
 * 根据设置更新用户界面
 * @param {Object} settings 当前设置
 */
function updateUIBasedOnSettings(settings) {
    const usernameInput = document.getElementById("username");
    const saveButton = document.getElementById("clickme_save");
    const clearButton = document.getElementById("clickme_clear");
    const autoLoginCheckbox = document.getElementById("cb");
    
    // 更新用户名显示和保存按钮文字
    if (settings["username"]) {
        if (usernameInput) usernameInput.value = settings["username"];
        if (saveButton) saveButton.value = "更新";
        
        // 启用清除按钮
        updateClearButton(clearButton, true);
    } else {
        // 禁用清除按钮
        updateClearButton(clearButton, false);
    }
    
    // 设置自动登录开关状态
    if (autoLoginCheckbox) {
        autoLoginCheckbox.checked = (settings["use_login"] === "Y");
    }
}

/**
 * 更新清除按钮状态
 * @param {HTMLElement} button 清除按钮元素
 * @param {boolean} enabled 是否启用
 */
function updateClearButton(button, enabled) {
    if (!button) return;
    
    button.disabled = !enabled;
    button.style.opacity = enabled ? "1" : "0.5";
    button.title = enabled ? "清除已保存的用户名和密码" : "暂无可清除的数据";
}

/**
 * 保存配置信息（支持密码加密）
 */
async function saveConfig() {
    console.log("============ saveConfig invoked ============");
    console.log("Storage availability:", typeof(Storage));
    
    // 检查浏览器存储支持
    if (typeof(Storage) === "undefined") {
        console.error("Browser does not support Web Storage API.");
        showMessage("抱歉，您的浏览器不支持本地存储功能", "error");
        return;
    }

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("passwd");
    
    if (!usernameInput || !passwordInput) {
        showMessage("界面元素加载异常，请刷新页面", "error");
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // 验证输入完整性
    if (!username || !password) {
        showMessage("请输入完整的用户名和密码", "warning");
        usernameInput.focus();
        return;
    }

    // 验证用户名格式
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showMessage("用户名格式无效，请使用字母、数字或下划线", "warning");
        usernameInput.focus();
        return;
    }
    
    // 验证密码长度
    if (password.length < 6) {
        showMessage("密码长度不能少于6位", "warning");
        passwordInput.focus();
        return;
    }

    // 显示保存中状态
    const saveButton = document.getElementById("clickme_save");
    setButtonState(saveButton, true, "保存中...");

    try {
    // 加密密码
    console.log("Encrypting password...");
        ensurePasswordCrypto();
        const encryptedPassword = await window.passwordCrypto.encryptPassword(password);
    console.log("Password encrypted.");

        // 保存到Chrome存储（密码已加密）
        chrome.storage.sync.set({
            'username': username, 
            'password': encryptedPassword, 
            'use_login': "Y"
        }, function() {
            // 恢复按钮状态
            setButtonState(saveButton, false, null, "更新");
            
            if (chrome.runtime.lastError) {
                console.error('Error while saving settings:', chrome.runtime.lastError);
                showMessage("保存失败，请重试", "error");
            } else {
                console.log('Settings saved successfully (password encrypted).');
                showMessage("配置保存成功！自动登录已启用（密码已安全加密）", "success");
                
                // 更新界面状态
                updateUIAfterSave();
            }
        });
        
    } catch (error) {
        console.error('Password encryption failed:', error);
        setButtonState(saveButton, false, null, "保存");
        
        // 提供更详细的错误信息
        let errorMessage = "密码加密失败，请重试";
        
        // 根据实际错误类型提供更准确的提示
        if (error.name === 'NotSupportedError' || 
            (error.message && error.message.includes('subtle')) ||
            typeof crypto === 'undefined' || 
            typeof crypto.subtle === 'undefined') {
            errorMessage = "浏览器不支持加密功能，请升级到Chrome 88+或使用HTTPS访问";
        } else if (error.message && (error.message.includes('密钥') || error.message.includes('初始化'))) {
            errorMessage = "加密密钥初始化失败，请清理浏览器数据后重试";
        } else if (error.message && error.message.includes('存储')) {
            errorMessage = "存储空间不足，请清理浏览器数据";
        } else if (error.name === 'QuotaExceededError') {
            errorMessage = "存储配额已满，请清理浏览器数据";
        }
        
        showMessage(errorMessage, "error");
    }
}

/**
 * 保存成功后更新界面
 */
function updateUIAfterSave() {
    const clearButton = document.getElementById("clickme_clear");
    const autoLoginCheckbox = document.getElementById("cb");
    
    // 启用清除按钮
    updateClearButton(clearButton, true);
    
    // 确保自动登录开关为开启状态
    if (autoLoginCheckbox && !autoLoginCheckbox.checked) {
        autoLoginCheckbox.checked = true;
    }
}

/**
 * 清除登录信息
 */
function clearLogin() {
    console.log("Clearing saved credentials...");
    
    // 确认对话框
    if (!confirm("确定要清除所有保存的登录信息吗？")) {
        return;
    }
    
    const clearButton = document.getElementById("clickme_clear");
    
    // 显示清除中状态
    setButtonState(clearButton, true, "清除中...");
    
    // 仅保留 use_login 状态为关闭，并移除用户名/密码
    chrome.storage.sync.set({ 'use_login': "N" }, function() {
        if (chrome.runtime.lastError) {
            console.error('Error while updating use_login:', chrome.runtime.lastError);
        }
        chrome.storage.sync.remove(['username', 'password'], function() {
            if (chrome.runtime.lastError) {
                console.error('Error while removing credentials:', chrome.runtime.lastError);
                showMessage("清除失败，请重试", "error");
                if (clearButton) setButtonState(clearButton, false);
                return;
            }
            console.log('Credentials cleared successfully.');
            showMessage("登录信息已清除，自动登录已关闭", "info");
            setTimeout(() => { location.reload(); }, 800);
        });
    });
}

/**
 * 自动登录开关切换处理
 */
function autoLoginToggleChange() {
    const checkbox = document.getElementById("cb");
    if (!checkbox) return;
    
    const isEnabled = checkbox.checked;
    console.log("Auto-login toggled:", isEnabled);
    
    chrome.storage.sync.set({
        'use_login': isEnabled ? "Y" : "N"
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('Error while toggling auto-login:', chrome.runtime.lastError);
            showMessage("设置失败，请重试", "error");
            // 还原开关状态
            checkbox.checked = !isEnabled;
        } else {
            const message = isEnabled ? "自动登录已启用" : "自动登录已关闭";
            console.log(`Setting saved: ${message}`);
            showMessage(message, isEnabled ? "success" : "info");
        }
    });
}
