console.log("PKU IAAA 自动登录脚本已加载");

// 设置 jQuery 全局 AJAX 配置（超时与不缓存），避免长时间挂起
try {
    if (typeof $ !== 'undefined' && typeof $.ajaxSetup === 'function') {
        $.ajaxSetup({ timeout: 8000, cache: false });
    }
} catch (e) {
    console.warn('设置 AJAX 超时失败: ', e);
}

// 从Chrome存储中获取用户设置并执行自动登录
chrome.storage.sync.get(['username', 'password', "use_login", "_passwordEncrypted"], async function(items) {
    // 检查Chrome存储API调用是否成功
    if (chrome.runtime.lastError) {
        console.error("获取存储数据失败:", chrome.runtime.lastError);
        return;
    }
    
    console.log("自动登录设置:", {
        enabled: items["use_login"],
        hasUsername: !!items["username"] && items["username"] !== "N",
        passwordEncrypted: items["_passwordEncrypted"]
    });
    
    // 检查是否启用自动登录且用户名密码已设置
    if (items["use_login"] === "Y" && items["username"] !== "N" && items["username"] !== undefined) {
        console.log("开始执行自动登录流程");
        
        try {
            // 处理密码解密
            let credentials = { ...items };
            
            if (items["_passwordEncrypted"] && items["password"]) {
                console.log("检测到加密密码，正在解密...");
                
                // 等待加密工具初始化
                if (typeof window.passwordCrypto === 'undefined') {
                    window.passwordCrypto = new PasswordCrypto();
                }
                
                credentials["password"] = await window.passwordCrypto.decryptPassword(items["password"]);
                console.log("密码解密成功");
            } else if (items["password"] && items["password"] !== "N") {
                console.log("使用未加密密码（向后兼容）");
                // 向后兼容：如果密码未加密，直接使用
                credentials["password"] = items["password"];
            }
            
            initAutoLogin(credentials);
            
        } catch (error) {
            console.error("密码解密失败:", error);
            console.log("自动登录失败：无法解密密码");
        }
        
    } else if (items["use_login"] === "N") {
        console.log("自动登录功能已禁用");
    } else {
        console.log("未配置自动登录信息");
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
            console.log("页面元素加载完成，开始填写凭据");
            fillCredentialsAndLogin(credentials, userNameEl, passwordEl);
        } else if (attempts < maxAttempts) {
            console.log(`等待页面元素加载... (${attempts + 1}/${maxAttempts})`);
            attempts++;
            // 如果元素还没加载，100ms后重试
            setTimeout(waitAndFillCredentials, 100);
        } else {
            console.error("页面元素加载超时，自动登录失败");
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
        
        console.log("用户凭据填写完成");
        
        // 检查移动端认证状态并处理登录
        checkAuthenticationStatus(credentials["username"]);
        
    } catch (error) {
        console.error("填写凭据时发生错误:", error);
    }
}

/**
 * 检查认证状态并处理不同的登录方式
 * @param {string} username 用户名
 */
function checkAuthenticationStatus(username) {
    const appIdEl = document.getElementById("appid");
    
    if (!appIdEl) {
        console.warn("未找到appid元素，尝试直接登录");
        attemptDirectLogin();
        return;
    }
    
    const appId = appIdEl.value;
    console.log("检查认证状态，AppID:", appId);
    
    // 调用IAAA接口检查移动端认证状态
    $.getJSON('/iaaa/isMobileAuthen.do', {
        userName: username,
        appId: appId,
        _rand: Math.random()
    })
    .done(function(data) {
        console.log("认证状态检查结果:", data);
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
        console.warn("认证状态检查失败:", { status, error, responseText: xhr.responseText });
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
        console.warn("认证检查未成功，尝试直接登录");
        attemptDirectLogin();
        return;
    }
    
    const { isMobileAuthen, authenMode, isBind } = data;
    console.log("认证模式:", { isMobileAuthen, authenMode, isBind });
    
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
        console.warn("未知的移动认证模式:", authenMode);
        attemptDirectLogin();
    }
}

/**
 * 处理OTP认证
 * @param {boolean} isBind 是否已绑定手机App
 */
function handleOTPAuthentication(isBind) {
    console.log("处理OTP认证，绑定状态:", isBind);
    
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
        console.log("需要绑定手机App");
    } else {
        if (otpButton.length) otpButton.hide();
        if (logonButton.length) logonButton.show();
        // 自动聚焦到OTP输入框
        setTimeout(() => {
            const otpInput = $("#otp_code");
            if (otpInput.length > 0) {
                otpInput.focus();
                console.log("OTP输入框已聚焦，等待用户输入验证码");
            } else {
                console.warn("未找到OTP输入框元素");
            }
        }, 300);
    }
}

/**
 * 处理SMS短信认证
 */
function handleSMSAuthentication() {
    console.log("处理SMS短信认证");
    
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
            console.log("自动发送短信验证码");
            window.sendSMSCode();
        } else {
            console.warn("未找到sendSMSCode函数，尝试点击页面上的发送验证码按钮");
            // 回退：尝试点击“发送验证码/获取验证码”按钮
            const candidates = Array.from(document.querySelectorAll('button, input[type="button"], a, .btn'));
            const sendBtn = candidates.find(el => {
                const text = (el.innerText || el.value || '').trim();
                return /发\s*送\s*验\s*证\s*码|获\s*取\s*验\s*证\s*码|send\s*code|get\s*code/i.test(text);
            });
            if (sendBtn) {
                console.log('点击发送验证码按钮:', sendBtn);
                sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                sendBtn.dispatchEvent(new Event('click', { bubbles: true }));
                if (typeof sendBtn.click === 'function') sendBtn.click();
            } else {
                console.warn('未找到可用的发送验证码按钮');
            }
        }
    } catch (error) {
        console.error("发送短信验证码失败:", error);
    }
    
    // 聚焦到短信验证码输入框
    setTimeout(() => {
        const smsInput = $("#sms_code");
        if (smsInput.length > 0) {
            smsInput.focus();
            console.log("短信验证码输入框已聚焦，等待用户输入验证码");
        } else {
            console.warn("未找到短信验证码输入框元素");
        }
    }, 500);
}

/**
 * 处理普通登录（无需额外验证）
 */
function handleNormalLogin() {
    console.log("处理普通登录模式");
    
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
    console.log("尝试执行直接登录");
    
    try {
        // 优先尝试调用页面的登录函数
        if (typeof window.oauthLogon === 'function') {
            console.log("调用oauthLogon函数");
            window.oauthLogon();
        } else {
            // 如果函数不存在，尝试点击登录按钮
            console.log("未找到oauthLogon函数，尝试点击登录按钮");
            clickLoginButton();
        }
    } catch (error) {
        console.error("执行登录时发生错误:", error);
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
            console.log("找到并点击登录按钮:", loginBtn);
            // 触发多种事件确保兼容性
            loginBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            loginBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            loginBtn.dispatchEvent(new Event('click', { bubbles: true }));
            if (typeof loginBtn.click === 'function') loginBtn.click();
        } else {
            console.warn("未找到可用的登录按钮，可能需要用户手动操作");
        }
    }, 100);
}
