import { parseTimezoneOffset } from "../src/utils/timezone.js";

describe("parseTimezoneOffset", () => {
  test("falls back when value is nullish", () => {
    expect(parseTimezoneOffset(undefined, 180)).toBe(180);
    expect(parseTimezoneOffset(null, 180)).toBe(180);
  });

  test("preserves explicit numeric offsets including zero", () => {
    expect(parseTimezoneOffset(0, 180)).toBe(0);
    expect(parseTimezoneOffset("180", 0)).toBe(180);
    expect(parseTimezoneOffset("-60", 180)).toBe(-60);
  });

  test("falls back on empty or invalid values", () => {
    expect(parseTimezoneOffset("", 180)).toBe(180);
    expect(parseTimezoneOffset("  ", 180)).toBe(180);
    expect(parseTimezoneOffset("nope", 180)).toBe(180);
  });
});
