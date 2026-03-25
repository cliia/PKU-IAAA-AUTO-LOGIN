export {};

declare global {
  interface Window {
    oauthLogon?: () => void;
    sendSMSCode?: () => void;
  }
}
