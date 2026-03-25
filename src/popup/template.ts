export const popupTemplate = `
  <div class="popup-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">PKU IAAA</p>
        <h1>自动登录</h1>
      </div>
      <p class="hero-subtitle">统一身份认证的本地解锁与自动填写工具</p>
    </header>

    <section id="statusBanner" class="status-banner" hidden></section>

    <form id="popupForm" class="panel" novalidate>
      <label class="field" for="usernameInput">
        <span>用户名</span>
        <input id="usernameInput" name="username" type="text" autocomplete="username" placeholder="请输入学号" />
      </label>

      <label class="field" for="passwordInput">
        <span>密码</span>
        <div class="password-row">
          <input
            id="passwordInput"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入 IAAA 密码"
          />
          <button id="togglePasswordButton" class="ghost-button" type="button" aria-label="显示或隐藏密码">
            显示
          </button>
        </div>
      </label>

      <label class="field" for="masterPasswordInput">
        <span>主密码</span>
        <input
          id="masterPasswordInput"
          name="masterPassword"
          type="password"
          autocomplete="off"
          placeholder="用于跨设备解锁"
        />
      </label>

      <div class="toggle-card">
        <div>
          <strong>自动登录</strong>
          <p>开启后访问 IAAA 页面会自动填写并继续认证流程。</p>
        </div>
        <label class="toggle">
          <input id="autoLoginToggle" type="checkbox" checked />
          <span class="track"></span>
        </label>
      </div>

      <div class="actions">
        <button id="submitButton" class="primary-button" type="submit">保存并启用</button>
        <button id="clearButton" class="secondary-button" type="button">清除数据</button>
      </div>

      <section id="message" class="message" hidden></section>
    </form>

    <footer class="footer">
      <p>v3.0.0 · 数据结构已更新，旧版缓存不会自动迁移。</p>
      <a href="https://github.com/cliia/PKU-IAAA-AUTO-LOGIN" target="_blank" rel="noreferrer">项目主页</a>
    </footer>
  </div>
`;
