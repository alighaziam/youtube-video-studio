import { describe, expect, it } from "vitest";
import { readingDirection } from "./textDirection";

describe("reading direction", () => {
  it("follows the first strong letter, not the surrounding interface", () => {
    expect(readingDirection("مرز ماژول باید دیده شود")).toBe("rtl");
    expect(readingDirection("Coupling hides the real cost")).toBe("ltr");
    expect(readingDirection("  ۱۲ — معماری نرم‌افزار")).toBe("rtl");
    expect(readingDirection("Lesson 08 — معماری")).toBe("ltr");
  });

  it("leaves an empty field to inherit the page direction", () => {
    expect(readingDirection("")).toBe("auto");
    expect(readingDirection("  12 — ")).toBe("auto");
  });
});