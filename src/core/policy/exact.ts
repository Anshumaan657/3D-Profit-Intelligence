/** Exact rational arithmetic for decimal inputs. No binary floats or intermediate rounding. */
export type ExactValue = Readonly<{ numerator: string; denominator: string }>;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const abs = (n: bigint) => n < ZERO ? -n : n;

function gcd(a: bigint, b: bigint): bigint {
  while (b !== ZERO) [a, b] = [b, a % b];
  return abs(a);
}

export class Exact {
  private constructor(private readonly n: bigint, private readonly d: bigint) {}

  private static ratio(n: bigint, d: bigint): Exact {
    if (d === ZERO) throw new Error("Division by zero.");
    if (d < ZERO) { n = -n; d = -d; }
    const divisor = gcd(n, d);
    n /= divisor; d /= divisor;
    if (abs(n).toString().length > 1000 || d.toString().length > 1000) {
      throw new Error("Exact calculation exceeds the 1,000-digit safety limit.");
    }
    return new Exact(n, d);
  }

  static from(value: string | ExactValue): Exact {
    if (typeof value === "string") {
      if (value.length > 102 || !/^-?\d+(?:\.\d+)?$/.test(value) || value.replace(/[-.]/g, "").length > 100) {
        throw new Error("Use a plain decimal string with at most 100 digits.");
      }
      const [whole, fraction = ""] = value.split(".");
      return Exact.ratio(BigInt(whole + fraction), TEN ** BigInt(fraction.length));
    }
    if (!value || Object.keys(value).sort().join(",") !== "denominator,numerator" ||
      typeof value.numerator !== "string" || typeof value.denominator !== "string" ||
      !/^-?\d{1,1000}$/.test(value.numerator) || !/^\d{1,1000}$/.test(value.denominator)) {
      throw new Error("Invalid exact-value representation.");
    }
    return Exact.ratio(BigInt(value.numerator), BigInt(value.denominator));
  }

  add(other: Exact): Exact { return Exact.ratio(this.n * other.d + other.n * this.d, this.d * other.d); }
  sub(other: Exact): Exact { return Exact.ratio(this.n * other.d - other.n * this.d, this.d * other.d); }
  mul(other: Exact): Exact { return Exact.ratio(this.n * other.n, this.d * other.d); }
  div(other: Exact): Exact { return Exact.ratio(this.n * other.d, this.d * other.n); }
  compare(other: Exact): number {
    const delta = this.n * other.d - other.n * this.d;
    return delta < ZERO ? -1 : delta > ZERO ? 1 : 0;
  }
  min(other: Exact): Exact { return this.compare(other) < 0 ? this : other; }
  max(other: Exact): Exact { return this.compare(other) > 0 ? this : other; }
  toJSON(): ExactValue { return { numerator: this.n.toString(), denominator: this.d.toString() }; }

  /** Display only; halfway values round away from zero. Never feed this back into calculations. */
  format(places = 2): string {
    if (!Number.isInteger(places) || places < 0 || places > 20) throw new Error("Display precision must be 0–20.");
    const scale = TEN ** BigInt(places);
    const scaled = abs(this.n) * scale;
    let rounded = scaled / this.d;
    if ((scaled % this.d) * BigInt(2) >= this.d) rounded += ONE;
    const digits = rounded.toString().padStart(places + 1, "0");
    const sign = this.n < ZERO && rounded !== ZERO ? "-" : "";
    return sign + (places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
  }
}

export const exact = (value: string | ExactValue) => Exact.from(value);
