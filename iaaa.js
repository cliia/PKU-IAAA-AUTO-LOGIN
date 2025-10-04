console.log("PKU IAAA auto-login script loaded.");

// 设置 jQuery 全局 AJAX 配置（超时与不缓存），避免长时间挂起
try {
    if (typeof $ !== 'undefined' && typeof $.ajaxSetup === 'function') {
        $.ajaxSetup({ timeout: 8000, cache: false });
    }
} catch (e) {
    console.warn('Failed to set AJAX timeout:', e);
}

// 从Chrome存储中获取用户设置并执行自动登录
chrome.storage.sync.get(['username', 'password', 'use_login'], async function(items) {
    // 检查Chrome存储API调用是否成功
    if (chrome.runtime.lastError) {
        console.error("Failed to get storage items:", chrome.runtime.lastError);
        return;
    }
    
    console.log("Auto-login settings:", {
        enabled: items["use_login"],
        hasUsername: !!items["username"],
    });
    
    // 检查是否启用自动登录且用户名密码已设置
    if (items["use_login"] === "Y" && items["username"]) {
    console.log("Starting auto-login flow...");
        
        try {
            // 处理密码解密
            let credentials = { ...items };
            
            if (items["password"]) {
                console.log("Encrypted password detected, decrypting...");
                if (typeof window.passwordCrypto === 'undefined') {
                    window.passwordCrypto = new PasswordCrypto();
                }
                credentials["password"] = await window.passwordCrypto.decryptPassword(items["password"]);
                console.log("Password decrypted successfully.");
            } else {
                console.warn("No password found in storage; aborting auto-login.");
                return;
            }
            
            initAutoLogin(credentials);
            
        } catch (error) {
            console.error("Password decryption failed:", error);
            console.log("Auto-login failed: unable to decrypt password.");
        }
        
    } else if (items["use_login"] === "N") {
        console.log("Auto-login is disabled.");
    } else {
        console.log("Auto-login not configured.");
    }
});

/**
 * 初始化自动登录流程
 * @param {Object} credentials 用户凭据
 */
function initAutoLogin(credentials) {
    // 添加等待机制，确保页面元素加载完成
    let attempts = 0;
    const maxAttempts = 50; // 最多等待5秒 (50 * 100ms = 5000ms)
    
    function waitAndFillCredentials() {
        const userNameEl = document.getElementById("user_name");
        const passwordEl = document.getElementById("password");
        
        // 检查必要的DOM元素是否存在
        if (userNameEl && passwordEl) {
            console.log("Form elements ready, filling credentials...");
            fillCredentialsAndLogin(credentials, userNameEl, passwordEl);
        } else if (attempts < maxAttempts) {
            console.log(`Waiting for form elements... (${attempts + 1}/${maxAttempts})`);
            attempts++;
            // 如果元素还没加载，100ms后重试
            setTimeout(waitAndFillCredentials, 100);
        } else {
            console.error("Timeout waiting for form elements, auto-login aborted.");
            // 可以在这里添加用户提示或其他错误处理
        }
    }
    
    // 开始等待并填充凭据
    waitAndFillCredentials();
}

/**
 * 填写用户凭据并处理登录
 * @param {Object} credentials 用户凭据
 * @param {HTMLElement} userNameEl 用户名输入框
 * @param {HTMLElement} passwordEl 密码输入框
 */
function fillCredentialsAndLogin(credentials, userNameEl, passwordEl) {
    try {
        // 填写用户名和密码
        userNameEl.value = credentials["username"];
        passwordEl.value = credentials["password"];
        
        // 触发输入事件，确保网站能检测到值的变化
        userNameEl.dispatchEvent(new Event('input', { bubbles: true }));
        userNameEl.dispatchEvent(new Event('change', { bubbles: true }));
        passwordEl.dispatchEvent(new Event('input', { bubbles: true }));
        passwordEl.dispatchEvent(new Event('change', { bubbles: true }));
        
    console.log("Credentials filled.");
        
        // 检查移动端认证状态并处理登录
        checkAuthenticationStatus(credentials["username"]);
        
    } catch (error) {
    console.error("Error while filling credentials:", error);
    }
}

/**
 * 检查认证状态并处理不同的登录方式
 * @param {string} username 用户名
 */
function checkAuthenticationStatus(username) {
    const appIdEl = document.getElementById("appid");
    
    if (!appIdEl) {
    console.warn("AppID element not found, attempting direct login.");
        attemptDirectLogin();
        return;
    }
    
    const appId = appIdEl.value;
    console.log("Checking auth status, appId:", appId);
    
    // 调用IAAA接口检查移动端认证状态
    $.getJSON('/iaaa/isMobileAuthen.do', {
        userName: username,
        appId: appId,
        _rand: Math.random()
    })
    .done(function(data) {
    console.log("Auth status response:", data);
        handleAuthenticationResponse(data);
    })
    .fail(function(xhr, status, error) {
        // 详细的错误处理和用户友好的提示
        const errorMessages = {
            'timeout': '网络连接超时，正在尝试直接登录',
            'error': '网络连接失败，正在尝试直接登录',
            'parsererror': '服务器响应格式错误，正在尝试直接登录',
            'abort': '请求被中断，正在尝试直接登录'
        };
        
        const userMessage = errorMessages[status] || `网络请求失败(${status})，正在尝试直接登录`;
        console.warn("Auth status request failed:", { status, error, responseText: xhr.responseText });
        console.log(userMessage);
        
        // 显示错误信息到页面（如果有错误显示区域）
        const msgEl = document.getElementById("msg");
        if (msgEl) {
            msgEl.textContent = userMessage;
            msgEl.style.color = "#ff6b6b";
        }
        
        // 延迟后回退到直接登录模式，给用户时间看到错误信息
        setTimeout(() => {
            if (msgEl) {
                msgEl.textContent = "";
            }
            attemptDirectLogin();
        }, 2000);
    });
}

/**
 * 处理认证响应并执行相应的登录逻辑
 * @param {Object} data 认证响应数据
 */
function handleAuthenticationResponse(data) {
    // 清空错误信息
    $("#msg").text("");
    
    if (data.success !== true) {
    console.warn("Auth check unsuccessful, attempting direct login.");
        attemptDirectLogin();
        return;
    }
    
    const { isMobileAuthen, authenMode, isBind } = data;
    console.log("Auth mode:", { isMobileAuthen, authenMode, isBind });
    
    if (isMobileAuthen === true) {
        handleMobileAuthentication(authenMode, isBind);
    } else {
        handleNormalLogin();
    }
}

/**
 * 处理移动端认证（OTP或SMS）
 * @param {string} authenMode 认证模式
 * @param {boolean} isBind 是否已绑定
 */
function handleMobileAuthentication(authenMode, isBind) {
    if (authenMode === "OTP") {
        handleOTPAuthentication(isBind);
    } else if (authenMode === "SMS") {
        handleSMSAuthentication();
    } else {
        console.warn("Unknown mobile auth mode:", authenMode);
        attemptDirectLogin();
    }
}

/**
 * 处理OTP认证
 * @param {boolean} isBind 是否已绑定手机App
 */
function handleOTPAuthentication(isBind) {
    console.log("Handling OTP authentication, bind status:", isBind);
    
    // 安全检查DOM元素是否存在
    const smsArea = $("#sms_area");
    const otpArea = $("#otp_area");
    const msgEl = $("#msg");
    const otpButton = $("#otp_button");
    const logonButton = $("#logon_button");
    
    if (smsArea.length) smsArea.hide();
    if (otpArea.length) otpArea.show();
    
    if (isBind === false) {
        if (msgEl.length) msgEl.text("请先绑定手机App");
        if (otpButton.length) otpButton.show();
        if (logonButton.length) logonButton.hide();
    console.log("Binding to mobile app required.");
    } else {
        if (otpButton.length) otpButton.hide();
        if (logonButton.length) logonButton.show();
        // 自动聚焦到OTP输入框
        setTimeout(() => {
            const otpInput = $("#otp_code");
            if (otpInput.length > 0) {
                otpInput.focus();
                console.log("OTP input focused, awaiting user input.");
            } else {
                console.warn("OTP input element not found.");
            }
        }, 300);
    }
}

/**
 * 处理SMS短信认证
 */
function handleSMSAuthentication() {
    console.log("Handling SMS authentication.");
    
    // 安全检查DOM元素是否存在
    const smsArea = $("#sms_area");
    const otpArea = $("#otp_area");
    const otpButton = $("#otp_button");
    const logonButton = $("#logon_button");
    
    if (smsArea.length) smsArea.show();
    if (otpArea.length) otpArea.hide();
    if (otpButton.length) otpButton.hide();
    if (logonButton.length) logonButton.show();
    
    // 自动发送短信验证码
    try {
        if (typeof window.sendSMSCode === 'function') {
            console.log("Sending SMS code automatically.");
            window.sendSMSCode();
        } else {
            console.warn("sendSMSCode function not found, trying to click a send-code button on page.");
            // 回退：尝试点击“发送验证码/获取验证码”按钮
            const candidates = Array.from(document.querySelectorAll('button, input[type="button"], a, .btn'));
            const sendBtn = candidates.find(el => {
                const text = (el.innerText || el.value || '').trim();
                return /发\s*送\s*验\s*证\s*码|获\s*取\s*验\s*证\s*码|send\s*code|get\s*code/i.test(text);
            });
            if (sendBtn) {
                console.log('Clicking send-code button:', sendBtn);
                sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                sendBtn.dispatchEvent(new Event('click', { bubbles: true }));
                if (typeof sendBtn.click === 'function') sendBtn.click();
            } else {
                console.warn('No usable send-code button found.');
            }
        }
    } catch (error) {
        console.error("Failed to send SMS code:", error);
    }
    
    // 聚焦到短信验证码输入框
    setTimeout(() => {
        const smsInput = $("#sms_code");
        if (smsInput.length > 0) {
            smsInput.focus();
            console.log("SMS code input focused, awaiting user input.");
        } else {
            console.warn("SMS code input element not found.");
        }
    }, 500);
}

/**
 * 处理普通登录（无需额外验证）
 */
function handleNormalLogin() {
    console.log("Handling normal login mode.");
    
    // 安全检查DOM元素是否存在
    const smsArea = $("#sms_area");
    const otpArea = $("#otp_area");
    const otpButton = $("#otp_button");
    const logonButton = $("#logon_button");
    
    if (smsArea.length) smsArea.hide();
    if (otpArea.length) otpArea.hide();
    if (otpButton.length) otpButton.hide();
    if (logonButton.length) logonButton.show();
    
    // 延迟执行登录以确保UI更新完成
    setTimeout(() => {
        attemptDirectLogin();
    }, 200);
}

/**
 * 尝试直接登录
 */
function attemptDirectLogin() {
    console.log("Attempting direct login.");
    
    try {
        // 优先尝试调用页面的登录函数
        if (typeof window.oauthLogon === 'function') {
            console.log("Calling oauthLogon()...");
            window.oauthLogon();
        } else {
            // 如果函数不存在，尝试点击登录按钮
            console.log("oauthLogon() not found, clicking login button instead.");
            clickLoginButton();
        }
    } catch (error) {
        console.error("Error while attempting login:", error);
        // 错误回退：尝试点击按钮
        clickLoginButton();
    }
}

/**
 * 点击登录按钮
 */
function clickLoginButton() {
    setTimeout(() => {
        // 按优先级查找登录按钮
        const buttonSelectors = [
            "#logon_button",
            'button[type="submit"]',
            'input[type="submit"]',
            '.btn-primary',
            'input[value*="登录"]'
        ];

        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0' &&
                rect.width > 0 && rect.height > 0
            );
        };

        let loginBtn = null;
        for (const selector of buttonSelectors) {
            const candidate = document.querySelector(selector);
            if (candidate && !candidate.disabled && isVisible(candidate)) {
                loginBtn = candidate;
                break;
            }
        }

        // 文本内容匹配回退
        if (!loginBtn) {
            const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], .btn'));
            loginBtn = allButtons.find(el => {
                if (el.disabled || !isVisible(el)) return false;
                const text = (el.innerText || el.value || '').trim();
                return /登\s*录|log\s*in/i.test(text);
            }) || null;
        }

        if (loginBtn) {
            console.log("Found and clicking login button:", loginBtn);
            // 触发多种事件确保兼容性
            loginBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            loginBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            loginBtn.dispatchEvent(new Event('click', { bubbles: true }));
            if (typeof loginBtn.click === 'function') loginBtn.click();
        } else {
            console.warn("No usable login button found; manual action may be required.");
        }
    }, 100);
}
