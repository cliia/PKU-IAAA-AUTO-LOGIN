console.log("PKU IAAA auto-login script loaded.");

try {
    if (typeof $ !== 'undefined' && typeof $.ajaxSetup === 'function') {
        $.ajaxSetup({ timeout: 8000, cache: false });
    }
} catch (e) {
    console.warn('Failed to set AJAX timeout:', e);
}

// 获取同步设置和本地密钥
chrome.storage.sync.get(['username', 'encrypted_password', 'salt', 'iv', 'use_login', 'password'], function(syncItems) {
    chrome.storage.local.get(['cached_key'], async function(localItems) {
        
        if (chrome.runtime.lastError) {
            console.error("Storage error:", chrome.runtime.lastError);
            return;
        }

        console.log("Auto-login config:", {
            enabled: syncItems.use_login === "Y",
            hasUsername: !!syncItems.username,
            hasEncryptedPassword: !!syncItems.encrypted_password,
            hasLocalKey: !!localItems.cached_key
        });

        // 检查基本开关
        if (syncItems.use_login !== "Y" || !syncItems.username) {
            console.log("Auto-login disabled or not configured.");
            return;
        }

        let password = null;

        // 尝试解密密码
        try {
            // 优先使用新版加密逻辑
            if (syncItems.encrypted_password && syncItems.iv && localItems.cached_key) {
                console.log("Attempting decryption with master key...");
                if (typeof window.passwordCrypto === 'undefined') {
                    window.passwordCrypto = new PasswordCrypto();
                }
                password = await window.passwordCrypto.decryptWithKey(
                    syncItems.encrypted_password,
                    syncItems.iv,
                    localItems.cached_key
                );
                console.log("Decryption successful.");
            }
            // 兼容旧版逻辑 (如果用户尚未更新配置)
            else if (syncItems.password && !syncItems.encrypted_password) {
                 console.log("Legacy password format detected.");
                 // 旧版逻辑暂不处理，或者如果有需要可以保留旧版解密代码
                 // 根据用户需求"处理旧密码太麻烦了"，这里我们主要关注新逻辑
                 // 但为了防止旧版本直接崩坏，如果检测到纯文本或旧版加密，可以尝试直接使用（如果它是明文）或者提示更新
                 // 由于旧版代码也是加密的，且密钥在本地，如果用户是从旧版升级上来，cached_key可能不存在，
                 // 这里简单处理：直接使用旧版密码，以维持兼容性
                 password = syncItems.password;
            }
            else {
                console.log("Missing decryption material (Key or Password). Device might be locked.");
            }
        } catch (e) {
            console.error("Decryption error:", e);
        }

        if (password) {
            initAutoLogin({
                username: syncItems.username,
                password: password
            });
        } else {
            console.log("Auto-login skipped: Cannot obtain password (Locked or Not Configured).");
        }
    });
});

/**
 * 初始化自动登录流程
 */
function initAutoLogin(credentials) {
    let attempts = 0;
    const maxAttempts = 50;
    
    function waitAndFillCredentials() {
        const userNameEl = document.getElementById("user_name");
        const passwordEl = document.getElementById("password");
        
        if (userNameEl && passwordEl) {
            fillCredentialsAndLogin(credentials, userNameEl, passwordEl);
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(waitAndFillCredentials, 100);
        } else {
            console.error("Timeout waiting for form elements.");
        }
    }
    
    waitAndFillCredentials();
}

/**
 * 填写凭据并登录
 */
function fillCredentialsAndLogin(credentials, userNameEl, passwordEl) {
    try {
        userNameEl.value = credentials["username"];
        passwordEl.value = credentials["password"];
        
        userNameEl.dispatchEvent(new Event('input', { bubbles: true }));
        userNameEl.dispatchEvent(new Event('change', { bubbles: true }));
        passwordEl.dispatchEvent(new Event('input', { bubbles: true }));
        passwordEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        checkAuthenticationStatus(credentials["username"]);
        
    } catch (error) {
        console.error("Error filling credentials:", error);
    }
}

/**
 * 检查认证状态
 */
function checkAuthenticationStatus(username) {
    const appIdEl = document.getElementById("appid");
    
    if (!appIdEl) {
        attemptDirectLogin();
        return;
    }
    
    const appId = appIdEl.value;
    
    $.getJSON('/iaaa/isMobileAuthen.do', {
        userName: username,
        appId: appId,
        _rand: Math.random()
    })
    .done(function(data) {
        handleAuthenticationResponse(data);
    })
    .fail(function(xhr, status, error) {
        console.warn("Auth status request failed, falling back to direct login.");
        attemptDirectLogin();
    });
}

function handleAuthenticationResponse(data) {
    $("#msg").text("");
    
    if (data.success !== true) {
        attemptDirectLogin();
        return;
    }
    
    const { isMobileAuthen, authenMode, isBind } = data;
    
    if (isMobileAuthen === true) {
        handleMobileAuthentication(authenMode, isBind);
    } else {
        handleNormalLogin();
    }
}

function handleMobileAuthentication(authenMode, isBind) {
    if (authenMode === "OTP") {
        handleOTPAuthentication(isBind);
    } else if (authenMode === "SMS") {
        handleSMSAuthentication();
    } else {
        attemptDirectLogin();
    }
}

function handleOTPAuthentication(isBind) {
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
    } else {
        if (otpButton.length) otpButton.hide();
        if (logonButton.length) logonButton.show();
        setTimeout(() => {
            const otpInput = $("#otp_code");
            if (otpInput.length > 0) otpInput.focus();
        }, 300);
    }
}

function handleSMSAuthentication() {
    const smsArea = $("#sms_area");
    const otpArea = $("#otp_area");
    const otpButton = $("#otp_button");
    const logonButton = $("#logon_button");
    
    if (smsArea.length) smsArea.show();
    if (otpArea.length) otpArea.hide();
    if (otpButton.length) otpButton.hide();
    if (logonButton.length) logonButton.show();
    
    try {
        if (typeof window.sendSMSCode === 'function') {
            window.sendSMSCode();
        } else {
            const candidates = Array.from(document.querySelectorAll('button, input[type="button"], a, .btn'));
            const sendBtn = candidates.find(el => {
                const text = (el.innerText || el.value || '').trim();
                return /发\s*送\s*验\s*证\s*码|获\s*取\s*验\s*证\s*码|send\s*code|get\s*code/i.test(text);
            });
            if (sendBtn) {
                if (typeof sendBtn.click === 'function') sendBtn.click();
            }
        }
    } catch (error) {
        console.error("Failed to send SMS code:", error);
    }
    
    setTimeout(() => {
        const smsInput = $("#sms_code");
        if (smsInput.length > 0) smsInput.focus();
    }, 500);
}

function handleNormalLogin() {
    const smsArea = $("#sms_area");
    const otpArea = $("#otp_area");
    const otpButton = $("#otp_button");
    const logonButton = $("#logon_button");
    
    if (smsArea.length) smsArea.hide();
    if (otpArea.length) otpArea.hide();
    if (otpButton.length) otpButton.hide();
    if (logonButton.length) logonButton.show();
    
    setTimeout(() => {
        attemptDirectLogin();
    }, 200);
}

function attemptDirectLogin() {
    try {
        if (typeof window.oauthLogon === 'function') {
            window.oauthLogon();
        } else {
            clickLoginButton();
        }
    } catch (error) {
        clickLoginButton();
    }
}

function clickLoginButton() {
    setTimeout(() => {
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

        if (!loginBtn) {
            const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], .btn'));
            loginBtn = allButtons.find(el => {
                if (el.disabled || !isVisible(el)) return false;
                const text = (el.innerText || el.value || '').trim();
                return /登\s*录|log\s*in/i.test(text);
            }) || null;
        }

        if (loginBtn) {
            loginBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            loginBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            loginBtn.dispatchEvent(new Event('click', { bubbles: true }));
            if (typeof loginBtn.click === 'function') loginBtn.click();
        }
    }, 100);
}
