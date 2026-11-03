export function requestLanguage(value: string = "en"): "ar" | "en" {
  return /^ar(?:[-_]|$)/i.test(value.trim()) ? "ar" : "en";
}
