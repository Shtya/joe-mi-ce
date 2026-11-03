import { requestLanguage } from "common/request-language";

const loginFailures = {
  "Invalid username or password": {
    code: "INVALID_CREDENTIALS",
    ar: "اسم المستخدم أو كلمة المرور غير صحيحة",
  },
  "Your account is inactive": {
    code: "ACCOUNT_INACTIVE",
    ar: "حسابك غير نشط. يرجى التواصل مع الإدارة",
  },
  "MAC ID is required for this account": {
    code: "DEVICE_ID_REQUIRED",
    ar: "تعذر تحديد الجهاز. يرجى الانتظار ثم إعادة محاولة تسجيل الدخول",
  },
  "This account is registered to another MAC ID": {
    code: "DEVICE_MISMATCH",
    ar: "هذا الحساب مرتبط بجهاز آخر. يرجى التواصل مع الإدارة لإعادة تعيين الجهاز",
  },
} satisfies Record<string, { code: string; ar: string }>;

export function describeLoginFailure(message: string, language: string) {
  const failure = Object.prototype.hasOwnProperty.call(loginFailures, message)
    ? loginFailures[message as keyof typeof loginFailures]
    : undefined;
  return {
    code: failure?.code ?? "LOGIN_REJECTED",
    message:
      requestLanguage(language) === "ar" && failure ? failure.ar : message,
  };
}
