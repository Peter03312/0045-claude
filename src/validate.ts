import { ZERO, compare as compareDecimals, fromNumber, fromString, type Decimal } from './decimal';
import { parseJson, RawNumber } from './json';
import type { Problem, Strip, ValidationError } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * 校验未知输入为合法 Problem。
 * 每个错误都带定位路径（如 strips[1].prerequisites[0]），调用方据此清除旧解。
 */
export function validateProblem(input: unknown): { problem: Problem } | { errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isRecord(input)) {
    return { errors: [{ path: '$', message: '根节点必须是 JSON 对象' }] };
  }

  // ---- fragments ----
  const fragments: string[] = [];
  const fragmentSet = new Set<string>();
  if (!Array.isArray(input.fragments)) {
    err('fragments', '必须是非空字符串数组');
  } else {
    input.fragments.forEach((f, i) => {
      const path = `fragments[${i}]`;
      if (!isNonEmptyString(f)) {
        err(path, '碎片编号必须是非空字符串');
      } else if (fragmentSet.has(f)) {
        err(path, `碎片编号 "${f}" 重复`);
      } else {
        fragmentSet.add(f);
        fragments.push(f);
      }
    });
    if (input.fragments.length > 0 && fragments.length === 0) {
      err('fragments', '至少需要一个合法碎片编号');
    }
  }

  // ---- initialAnchored ----
  const initialAnchored: string[] = [];
  const anchoredSet = new Set<string>();
  if (!Array.isArray(input.initialAnchored)) {
    err('initialAnchored', '必须是碎片编号数组（可为空数组）');
  } else {
    input.initialAnchored.forEach((f, i) => {
      const path = `initialAnchored[${i}]`;
      if (!isNonEmptyString(f)) {
        err(path, '锚定碎片编号必须是非空字符串');
      } else if (!fragmentSet.has(f)) {
        err(path, `锚定碎片 "${f}" 不在 fragments 中`);
      } else if (anchoredSet.has(f)) {
        err(path, `锚定碎片 "${f}" 重复`);
      } else {
        anchoredSet.add(f);
        initialAnchored.push(f);
      }
    });
  }

  // ---- strips ----
  const strips: Strip[] = [];
  const stripIds = new Set<string>();
  const rawStrips: Record<string, unknown>[] = [];

  if (!Array.isArray(input.strips)) {
    err('strips', '必须是条带对象数组（可为空数组）');
  } else {
    input.strips.forEach((raw, i) => {
      const base = `strips[${i}]`;
      if (!isRecord(raw)) {
        err(base, '条带必须是对象');
        return;
      }
      rawStrips[i] = raw;

      // id
      if (!isNonEmptyString(raw.id)) {
        err(`${base}.id`, '条带编号必须是非空字符串');
      } else if (stripIds.has(raw.id)) {
        err(`${base}.id`, `条带编号 "${raw.id}" 重复`);
      } else {
        stripIds.add(raw.id);
      }

      // fragments
      const frags: string[] = [];
      const fragSeen = new Set<string>();
      if (!Array.isArray(raw.fragments) || raw.fragments.length === 0) {
        err(`${base}.fragments`, '所连碎片必须是非空数组');
      } else {
        raw.fragments.forEach((f, j) => {
          const path = `${base}.fragments[${j}]`;
          if (!isNonEmptyString(f)) {
            err(path, '所连碎片编号必须是非空字符串');
          } else if (!fragmentSet.has(f)) {
            err(path, `引用了不存在的碎片 "${f}"`);
          } else if (fragSeen.has(f)) {
            err(path, `所连碎片 "${f}" 重复`);
          } else {
            fragSeen.add(f);
            frags.push(f);
          }
        });
      }

      // face
      if (!isNonEmptyString(raw.face)) {
        err(`${base}.face`, '施工面必须是非空字符串');
      }

      // channel lists
      const readChannelList = (key: 'requiresChannels' | 'closesChannels'): string[] => {
        const out: string[] = [];
        const seen = new Set<string>();
        const v = raw[key];
        if (!Array.isArray(v)) {
          err(`${base}.${key}`, '必须是字符串数组（可为空数组）');
          return out;
        }
        v.forEach((c, j) => {
          const path = `${base}.${key}[${j}]`;
          if (!isNonEmptyString(c)) {
            err(path, '通道编号必须是非空字符串');
          } else if (seen.has(c)) {
            err(path, `通道 "${c}" 重复`);
          } else {
            seen.add(c);
            out.push(c);
          }
        });
        return out;
      };
      const requiresChannels = readChannelList('requiresChannels');
      const closesChannels = readChannelList('closesChannels');

      // prerequisites（引用合法性需等全部 id 收集完，先只校验形状）
      const prerequisites: string[] = [];
      const prereqSeen = new Set<string>();
      if (!Array.isArray(raw.prerequisites)) {
        err(`${base}.prerequisites`, '必须是条带编号数组（可为空数组）');
      } else {
        raw.prerequisites.forEach((p, j) => {
          const path = `${base}.prerequisites[${j}]`;
          if (!isNonEmptyString(p)) {
            err(path, '前置条带编号必须是非空字符串');
          } else if (p === raw.id) {
            err(path, `条带不能以自身 "${p}" 为前置`);
          } else if (prereqSeen.has(p)) {
            err(path, `前置条带 "${p}" 重复`);
          } else {
            prereqSeen.add(p);
            prerequisites.push(p);
          }
        });
      }

      // length：JSON 数值字面量（RawNumber，逐位保留精度）或程序传入的有限 number
      let length: Decimal = ZERO;
      let lengthInvalid = false;
      const rawLength = raw.length;
      if (rawLength instanceof RawNumber) {
        try {
          length = fromString(rawLength.raw);
        } catch (e) {
          err(`${base}.length`, e instanceof Error ? e.message : String(e));
          lengthInvalid = true;
        }
      } else if (typeof rawLength === 'number' && Number.isFinite(rawLength)) {
        length = fromNumber(rawLength);
      } else {
        err(`${base}.length`, '长度必须是非负有限数值');
        lengthInvalid = true;
      }
      if (!lengthInvalid && compareDecimals(length, ZERO) < 0) {
        err(`${base}.length`, '长度必须是非负有限数值');
      }

      // disabled
      if (typeof raw.disabled !== 'boolean') {
        err(`${base}.disabled`, '禁用状态必须是布尔值');
      }

      strips.push({
        id: isNonEmptyString(raw.id) ? raw.id : `__invalid_${i}`,
        fragments: frags,
        face: isNonEmptyString(raw.face) ? raw.face : '',
        requiresChannels,
        closesChannels,
        prerequisites,
        length,
        disabled: raw.disabled === true,
      });
    });

    // 前置引用存在性（第二轮，此时 stripIds 已收集完整）
    strips.forEach((s, i) => {
      s.prerequisites.forEach((p, j) => {
        if (!stripIds.has(p)) {
          err(`strips[${i}].prerequisites[${j}]`, `前置条带 "${p}" 不存在`);
        }
      });
    });
  }

  if (errors.length > 0) {
    return { errors };
  }
  return { problem: { fragments, initialAnchored, strips } };
}

/** 解析 JSON 文本并校验；数值字面量全程保留精度，语法错误带行列定位 */
export function parseProblem(text: string): { problem: Problem } | { errors: ValidationError[] } {
  let raw: unknown;
  try {
    raw = parseJson(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { errors: [{ path: '$', message: `JSON 解析失败：${message}` }] };
  }
  return validateProblem(raw);
}
