const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;
const LATIN_SCRIPT = /[A-Za-z\u00C0-\u024F]/u;

export function readingDirection(value: string): "rtl" | "ltr" | "auto" {
  for (const char of value) {
    if (ARABIC_SCRIPT.test(char)) return "rtl";
    if (LATIN_SCRIPT.test(char)) return "ltr";
  }
  return "auto";
}
