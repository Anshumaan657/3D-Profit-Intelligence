import { describe, expect, it } from "vitest";
import { exact } from "./exact";

describe("exact financial arithmetic", () => {
  it("adds decimal values without binary floating-point errors", () => {
    expect(exact("0.1").add(exact("0.2")).toJSON()).toEqual(exact("0.3").toJSON());
  });
  it("preserves fractions through multiplication and sums before display rounding", () => {
    expect(exact("1").div(exact("3")).mul(exact("3")).toJSON()).toEqual(exact("1").toJSON());
    expect(exact("0.005").add(exact("0.005")).format()).toBe("0.01");
    expect(exact("0.005").format()).toBe("0.01");
  });
  it.each([["1.005", "1.01"], ["-1.005", "-1.01"], ["-0.001", "0.00"], ["999.999", "1000.00"], ["-0", "0.00"]])("formats %s as %s", (input, output) => {
    expect(exact(input).format()).toBe(output);
  });
  it("supports large quantities beyond the safe integer range without loss", () => {
    expect(exact("9007199254740993").add(exact("1")).format(0)).toBe("9007199254740994");
  });
  it("round-trips repeating values through JSON without losing precision", () => {
    const third = exact("1").div(exact("3"));
    expect(exact(JSON.parse(JSON.stringify(third))).mul(exact("3")).format(0)).toBe("1");
  });
  it.each(["", " ", ".5", "1.", "1e2", "1,000", "NaN", "Infinity", "++1", "1".repeat(101)])("rejects malformed decimal %s", value => {
    expect(() => exact(value)).toThrow();
  });
  it("rejects zero division and invalid fractions or display precision", () => {
    expect(() => exact("0").div(exact("0"))).toThrow();
    expect(() => exact({ numerator: "1", denominator: "0" })).toThrow();
    expect(() => exact({ numerator: "1", denominator: "-1" })).toThrow();
    expect(() => exact({ numerator: "1", denominator: "1", extra: true } as never)).toThrow();
    expect(() => exact("1").format(21)).toThrow();
    expect(() => exact("1").format(1.5)).toThrow();
  });
  it("bounds arithmetic growth", () => {
    const large = exact({ numerator: "9".repeat(1000), denominator: "1" });
    expect(() => large.mul(large)).toThrow(/safety limit/);
  });
  it("compares signed values, selects min/max and normalizes fractions", () => {
    expect(exact("-2").min(exact("1")).format(0)).toBe("-2");
    expect(exact("-2").max(exact("0")).format(0)).toBe("0");
    expect(exact({ numerator: "-2", denominator: "4" }).toJSON()).toEqual({ numerator: "-1", denominator: "2" });
  });
});
