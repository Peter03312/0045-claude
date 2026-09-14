/**
 * 精确十进制小数：避免 0.1 + 0.2 !== 0.3 之类的浮点误差影响最优性比较。
 * 值 = mantissa × 10^exponent；mantissa 不保留尾部零（零值统一为 0×10^0）。
 * 输入为 JSON 数值（有限 double），其 toString 给出最短往返十进制表示，
 * 即用户所写小数的精确语义，据此做 BigInt 精确运算。
 */
export interface Decimal {
  readonly mantissa: bigint;
  readonly exponent: number;
}

export const ZERO: Decimal = { mantissa: 0n, exponent: 0 };

function normalize(mantissa: bigint, exponent: number): Decimal {
  if (mantissa === 0n) return ZERO;
  let m = mantissa;
  let e = exponent;
  while (m % 10n === 0n) {
    m /= 10n;
    e++;
  }
  return { mantissa: m, exponent: e };
}

/** 有限数值 → 精确十进制（按最短往返表示解析，支持科学计数法） */
export function fromNumber(n: number): Decimal {
  if (!Number.isFinite(n)) {
    throw new Error(`非有限数值无法转为十进制：${n}`);
  }
  if (n === 0) return ZERO;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(n.toString());
  if (!match) {
    throw new Error(`无法解析数值：${n.toString()}`);
  }
  const [, sign, intPart, fracPart = '', expPart = '0'] = match;
  const digits = intPart + fracPart;
  const mantissa = BigInt((sign === '-' ? '-' : '') + digits);
  const exponent = Number(expPart) - fracPart.length;
  return normalize(mantissa, exponent);
}

export function add(a: Decimal, b: Decimal): Decimal {
  if (a.mantissa === 0n) return b;
  if (b.mantissa === 0n) return a;
  const e = Math.min(a.exponent, b.exponent);
  const m =
    a.mantissa * 10n ** BigInt(a.exponent - e) + b.mantissa * 10n ** BigInt(b.exponent - e);
  return normalize(m, e);
}

/** 负数 / 零 / 正数 返回 -1 / 0 / 1 */
function signOf(d: Decimal): number {
  return d.mantissa < 0n ? -1 : d.mantissa > 0n ? 1 : 0;
}

export function compare(a: Decimal, b: Decimal): number {
  const sa = signOf(a);
  const sb = signOf(b);
  if (sa !== sb) return sa - sb;
  if (sa === 0) return 0;
  const e = Math.min(a.exponent, b.exponent);
  const am = a.mantissa * 10n ** BigInt(a.exponent - e);
  const bm = b.mantissa * 10n ** BigInt(b.exponent - e);
  const d = am < bm ? -1 : am > bm ? 1 : 0;
  return sa === 1 ? d : -d;
}

/** 精确十进制字符串（不丢精度，不用科学计数法） */
export function toStringExact(d: Decimal): string {
  if (d.mantissa === 0n) return '0';
  const negative = d.mantissa < 0n;
  const digits = (negative ? -d.mantissa : d.mantissa).toString();
  let body: string;
  if (d.exponent >= 0) {
    body = digits + '0'.repeat(d.exponent);
  } else {
    const point = digits.length + d.exponent;
    if (point > 0) {
      body = `${digits.slice(0, point)}.${digits.slice(point)}`;
    } else {
      body = `0.${'0'.repeat(-point)}${digits}`;
    }
  }
  return negative ? `-${body}` : body;
}

/** 转回 double 供展示：取精确值的最短往返表示（如 0.1+0.2 显示为 0.3） */
export function toNumber(d: Decimal): number {
  return Number(toStringExact(d));
}
