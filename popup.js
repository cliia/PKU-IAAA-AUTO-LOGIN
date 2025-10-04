/**
 * PKU IAAA 自动登录插件弹窗脚本
 * 版本: 2.0
 * 功能：管理用户凭据和自动登录设置
 * 兼容: Manifest V3
 * 安全特性：使用 AES-GCM 加密存储密码
 */

console.log("PKU IAAA 弹窗脚本已加载");

// 加密工具实例将由 crypto-utils.js 提供

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
    console.log("开始初始化弹窗界面");
    
    // 绑定事件处理器
    const saveButton = document.getElementById('clickme_save');
    const clearButton = document.getElementById('clickme_clear');
    const autoLoginCheckbox = document.getElementById("cb");
    
    console.log("找到的元素:", {
        saveButton: !!saveButton,
        clearButton: !!clearButton,
        autoLoginCheckbox: !!autoLoginCheckbox
    });
    
    if (saveButton) {
        saveButton.onclick = function() {
            console.log("保存按钮点击事件触发！");
            saveConfig();
        };
        console.log("保存按钮事件已绑定，onclick:", saveButton.onclick);
    } else {
        console.error("未找到保存按钮元素");
    }
    
    if (clearButton) {
        clearButton.onclick = clearLogin;
        console.log("清除按钮事件已绑定");
    } else {
        console.error("未找到清除按钮元素");
    }
    
    if (autoLoginCheckbox) {
        autoLoginCheckbox.onclick = autoLoginToggleChange;
        console.log("自动登录开关事件已绑定");
    } else {
        console.error("未找到自动登录开关元素");
    }
    
    // 绑定密码显示/隐藏切换事件
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('passwd');
    if (togglePassword && passwordInput) {
        togglePassword.onclick = function() {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePassword.textContent = isPassword ? '🙈' : '👁';
            togglePassword.title = isPassword ? '隐藏密码' : '显示密码';
        };
        console.log("密码显示/隐藏切换事件已绑定");
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
    
    console.log("弹窗界面初始化完成");
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
    chrome.storage.sync.get(["use_login", "username", "password", "_passwordEncrypted"], async function(items) {
        if (chrome.runtime.lastError) {
            console.error("加载设置失败:", chrome.runtime.lastError);
            showMessage("加载设置失败，请重试", "error");
            return;
        }
        
        console.log("当前设置:", { ...items, password: items.password ? "[已保护]" : undefined });
        
        // 检查是否需要升级密码加密
        if (items.password && items.password !== "N" && !items._passwordEncrypted) {
            console.log("检测到未加密的密码，正在自动升级...");
            try {
                await upgradePasswordEncryption(items.password, items.username, items.use_login);
                showMessage("密码安全升级完成", "info", 2000);
                // 重新加载设置
                setTimeout(() => loadCurrentSettings(), 100);
                return;
            } catch (error) {
                console.error("密码升级失败:", error);
                showMessage("密码安全升级失败", "warning", 3000);
            }
        }
        
        updateUIBasedOnSettings(items);
    });
}

/**
 * 升级现有明文密码为加密密码
 * @param {string} plainPassword - 明文密码
 * @param {string} username - 用户名
 * @param {string} useLogin - 登录状态
 */
async function upgradePasswordEncryption(plainPassword, username, useLogin) {
    try {
        console.log("开始升级密码加密...");
        const encryptedPassword = await window.passwordCrypto.encryptPassword(plainPassword);
        
        // 更新存储
        await new Promise((resolve, reject) => {
            chrome.storage.sync.set({
                'username': username,
                'password': encryptedPassword,
                'use_login': useLogin,
                '_passwordEncrypted': true
            }, function() {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        console.log("密码加密升级完成");
    } catch (error) {
        console.error("密码升级失败:", error);
        throw error;
    }
}

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
    if (settings["username"] && settings["username"] !== "N") {
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
    console.log("============ 保存配置函数被调用 ============");
    console.log("Storage 支持检查:", typeof(Storage));
    
    // 检查浏览器存储支持
    if (typeof(Storage) === "undefined") {
        console.error("浏览器不支持本地存储");
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
        console.log("正在加密密码...");
        const encryptedPassword = await window.passwordCrypto.encryptPassword(password);
        console.log("密码加密完成");

        // 保存到Chrome存储（密码已加密）
        chrome.storage.sync.set({
            'username': username, 
            'password': encryptedPassword, 
            'use_login': "Y",
            '_passwordEncrypted': true // 标记密码已加密
        }, function() {
            // 恢复按钮状态
            setButtonState(saveButton, false, null, "更新");
            
            if (chrome.runtime.lastError) {
                console.error('保存设置时出错:', chrome.runtime.lastError);
                showMessage("保存失败，请重试", "error");
            } else {
                console.log('设置已成功保存（密码已加密）');
                showMessage("配置保存成功！自动登录已启用（密码已安全加密）", "success");
                
                // 更新界面状态
                updateUIAfterSave();
            }
        });
        
    } catch (error) {
        console.error('密码加密失败:', error);
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
    console.log("开始清除登录信息");
    
    // 确认对话框
    if (!confirm("确定要清除所有保存的登录信息吗？")) {
        return;
    }
    
    const clearButton = document.getElementById("clickme_clear");
    
    // 显示清除中状态
    setButtonState(clearButton, true, "清除中...");
    
    chrome.storage.sync.set({
        'username': "N", 
        'password': "N", 
        'use_login': "N",
        '_passwordEncrypted': false
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('清除设置时出错:', chrome.runtime.lastError);
            showMessage("清除失败，请重试", "error");
            
            // 恢复按钮状态
            if (clearButton) {
                clearButton.disabled = false;
                clearButton.value = originalValue;
            }
        } else {
            console.log('登录信息已成功清除');
            showMessage("登录信息已清除，自动登录已关闭", "info");
            
            // 延迟重新加载页面以更新界面
            setTimeout(() => {
                location.reload();
            }, 1500);
        }
    });
}

/**
 * 自动登录开关切换处理
 */
function autoLoginToggleChange() {
    const checkbox = document.getElementById("cb");
    if (!checkbox) return;
    
    const isEnabled = checkbox.checked;
    console.log("自动登录开关切换:", isEnabled);
    
    chrome.storage.sync.set({
        'use_login': isEnabled ? "Y" : "N"
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('切换自动登录状态时出错:', chrome.runtime.lastError);
            showMessage("设置失败，请重试", "error");
            // 还原开关状态
            checkbox.checked = !isEnabled;
        } else {
            const message = isEnabled ? "自动登录已启用" : "自动登录已关闭";
            console.log(`设置已保存: ${message}`);
            showMessage(message, isEnabled ? "success" : "info");
        }
    });
}

/**
 * 显示状态消息
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型: success, error, warning, info
 */
function showMessage(message, type = "info") {
    const resultDiv = document.getElementById("result");
    
    // 设置消息样式
    const styles = {
        success: "background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;",
        error: "background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;",
        warning: "background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7;",
        info: "background-color: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;"
    };
    
    resultDiv.style.cssText = styles[type] || styles.info;
    resultDiv.innerHTML = message;
    
    // 3秒后清除消息
    setTimeout(() => {
        resultDiv.innerHTML = "";
        resultDiv.style.cssText = "";
    }, 3000);
}

