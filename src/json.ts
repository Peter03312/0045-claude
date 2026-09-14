/**
 * 保留数值字面量的 JSON 解析。
 * 原生 JSON.parse 把数值先舍入到 double：1.00000000000000001 与 1.00000000000000002
 * 会得到同一个数，长度精度在解析阶段就丢失了。这里把数值原样保留为 RawNumber，
 * 由下游用精确十进制解释；其余类型与 JSON.parse 一致。
 */

/** JSON 数值的原始字面量（语法已由解析器校验） */
export class RawNumber {
  constructor(public readonly raw: string) {}
}

export type JsonValue =
  | null
  | boolean
  | string
  | RawNumber
  | JsonValue[]
  | { [key: string]: JsonValue };

export function parseJson(text: string): JsonValue {
  let pos = 0;

  function fail(message: string): never {
    let line = 1;
    let col = 1;
    for (let k = 0; k < pos && k < text.length; k++) {
      if (text[k] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    throw new SyntaxError(`第 ${line} 行第 ${col} 列：${message}`);
  }

  function skipWhitespace(): void {
    while (
      pos < text.length &&
      (text[pos] === ' ' || text[pos] === '\t' || text[pos] === '\n' || text[pos] === '\r')
    ) {
      pos++;
    }
  }

  function parseString(): string {
    pos++; // 跳过开引号
    let out = '';
    while (pos < text.length) {
      const ch = text[pos];
      if (ch === '"') {
        pos++;
        return out;
      }
      if (ch === '\\') {
        pos++;
        if (pos >= text.length) fail('字符串转义不完整');
        const esc = text[pos];
        switch (esc) {
          case '"':
            out += '"';
            pos++;
            break;
          case '\\':
            out += '\\';
            pos++;
            break;
          case '/':
            out += '/';
            pos++;
            break;
          case 'b':
            out += '\b';
            pos++;
            break;
          case 'f':
            out += '\f';
            pos++;
            break;
          case 'n':
            out += '\n';
            pos++;
            break;
          case 'r':
            out += '\r';
            pos++;
            break;
          case 't':
            out += '\t';
            pos++;
            break;
          case 'u': {
            const hex = text.slice(pos + 1, pos + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`非法 Unicode 转义 \\u${hex}`);
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 5;
            break;
          }
          default:
            fail(`非法转义字符 \\${esc}`);
        }
        continue;
      }
      if (ch < ' ') fail('字符串含未转义的控制字符');
      out += ch;
      pos++;
    }
    return fail('字符串未闭合');
  }

  function parseNumber(): RawNumber {
    const start = pos;
    if (text[pos] === '-') pos++;
    if (pos >= text.length) fail('数值不完整');
    if (text[pos] === '0') {
      pos++;
    } else if (text[pos] >= '1' && text[pos] <= '9') {
      while (pos < text.length && text[pos] >= '0' && text[pos] <= '9') pos++;
    } else {
      fail('非法数值');
    }
    if (text[pos] === '.') {
      pos++;
      if (pos >= text.length || text[pos] < '0' || text[pos] > '9') fail('小数点后缺少数字');
      while (pos < text.length && text[pos] >= '0' && text[pos] <= '9') pos++;
    }
    if (text[pos] === 'e' || text[pos] === 'E') {
      pos++;
      if (text[pos] === '+' || text[pos] === '-') pos++;
      if (pos >= text.length || text[pos] < '0' || text[pos] > '9') fail('指数缺少数字');
      while (pos < text.length && text[pos] >= '0' && text[pos] <= '9') pos++;
    }
    return new RawNumber(text.slice(start, pos));
  }

  function parseKeyword(keyword: string, value: JsonValue): JsonValue {
    if (text.startsWith(keyword, pos)) {
      pos += keyword.length;
      return value;
    }
    return fail('非法字面值');
  }

  function parseArray(): JsonValue[] {
    pos++; // [
    const arr: JsonValue[] = [];
    skipWhitespace();
    if (text[pos] === ']') {
      pos++;
      return arr;
    }
    for (;;) {
      skipWhitespace();
      arr.push(parseValue());
      skipWhitespace();
      if (text[pos] === ',') {
        pos++;
        continue;
      }
      if (text[pos] === ']') {
        pos++;
        return arr;
      }
      fail('数组缺少逗号或右括号');
    }
  }

  function parseObject(): { [key: string]: JsonValue } {
    pos++; // {
    const obj: { [key: string]: JsonValue } = {};
    skipWhitespace();
    if (text[pos] === '}') {
      pos++;
      return obj;
    }
    for (;;) {
      skipWhitespace();
      if (text[pos] !== '"') fail('对象键必须是字符串');
      const key = parseString();
      skipWhitespace();
      if (text[pos] !== ':') fail('对象键后缺少冒号');
      pos++;
      skipWhitespace();
      obj[key] = parseValue();
      skipWhitespace();
      if (text[pos] === ',') {
        pos++;
        continue;
      }
      if (text[pos] === '}') {
        pos++;
        return obj;
      }
      fail('对象缺少逗号或右括号');
    }
  }

  function parseValue(): JsonValue {
    if (pos >= text.length) fail('意外的文本结尾');
    const ch = text[pos];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    if (ch === 't') return parseKeyword('true', true);
    if (ch === 'f') return parseKeyword('false', false);
    if (ch === 'n') return parseKeyword('null', null);
    return fail(`无法识别的字符 ${JSON.stringify(ch)}`);
  }

  skipWhitespace();
  const value = parseValue();
  skipWhitespace();
  if (pos < text.length) fail('JSON 文本存在多余内容');
  return value;
}

/** 序列化回 JSON 文本（缩进 2 空格，与 JSON.stringify(., 2) 版式一致），RawNumber 原样输出 */
export function stringifyJson(value: JsonValue): string {
  const go = (v: JsonValue, level: number): string => {
    if (v === null) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (v instanceof RawNumber) return v.raw;
    const pad = '  '.repeat(level);
    const padIn = '  '.repeat(level + 1);
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      return `[\n${v.map((x) => padIn + go(x, level + 1)).join(',\n')}\n${pad}]`;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    const body = keys
      .map((k) => `${padIn}${JSON.stringify(k)}: ${go(v[k], level + 1)}`)
      .join(',\n');
    return `{\n${body}\n${pad}}`;
  };
  return go(value, 0);
}
