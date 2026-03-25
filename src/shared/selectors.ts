export const IAAA_SELECTORS = {
  userName: "#user_name",
  password: "#password",
  appId: "#appid",
  message: "#msg",
  smsArea: "#sms_area",
  otpArea: "#otp_area",
  otpButton: "#otp_button",
  logonButton: "#logon_button",
  smsCode: "#sms_code",
  otpCode: "#otp_code",
} as const;

export const LOGIN_BUTTON_SELECTORS = [
  "#logon_button",
  'button[type="submit"]',
  'input[type="submit"]',
  '.btn-primary',
  'input[value*="登录"]',
] as const;

export const SEND_CODE_BUTTON_PATTERN =
  /发\s*送\s*验\s*证\s*码|获\s*取\s*验\s*证\s*码|send\s*code|get\s*code/i;

export const LOGIN_BUTTON_PATTERN = /登\s*录|log\s*in/i;
