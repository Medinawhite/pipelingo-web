// A small evaluator for GitHub Actions expressions: ${{ github.ref == 'refs/heads/main' }}.
// Supports literals, context lookups, ! && || == != < > <= >=, parentheses and the common
// functions (startsWith, endsWith, contains, format, toJSON, success, failure, always, cancelled).

export type Value = string | number | boolean | null | Value[] | { [k: string]: Value };
export type Contexts = Record<string, Value>;

export class ExpressionError extends Error {}

type Tok =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "'") {
      let v = "";
      i++;
      for (;;) {
        if (i >= src.length) throw new ExpressionError("cadena sin cerrar: falta una comilla simple");
        if (src[i] === "'" && src[i + 1] === "'") {
          v += "'";
          i += 2;
        } else if (src[i] === "'") {
          i++;
          break;
        } else v += src[i++];
      }
      toks.push({ t: "str", v });
    } else if (ch === '"') {
      throw new ExpressionError('en las expresiones las cadenas van entre comillas simples, no dobles');
    } else if (/[0-9]/.test(ch)) {
      const m = src.slice(i).match(/^\d+(\.\d+)?/)!;
      toks.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/)!;
      toks.push({ t: "id", v: m[0] });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (["==", "!=", "&&", "||", "<=", ">="].includes(two)) {
        toks.push({ t: "op", v: two });
        i += 2;
      } else if ("!()<>.,[]*".includes(ch)) {
        toks.push({ t: "op", v: ch });
        i++;
      } else throw new ExpressionError(`carácter inesperado «${ch}»`);
    }
  }
  return toks;
}

export function truthy(v: Value | undefined): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
  return !(typeof v === "number" && Number.isNaN(v));
}

function str(v: Value | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function looseEquals(a: Value | undefined, b: Value | undefined): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  if (typeof a === typeof b) return a === b;
  const num = (v: Value | undefined) =>
    v === null || v === undefined ? 0 : typeof v === "boolean" ? Number(v) : typeof v === "string" ? (v.trim() === "" ? 0 : Number(v)) : NaN;
  return num(a) === num(b);
}

/** Status of earlier steps or jobs, for success()/failure(). */
export interface StatusFns {
  failed: boolean;
}

export function evaluate(src: string, ctx: Contexts, status: StatusFns = { failed: false }): Value {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`se esperaba «${v}»`);
    p++;
  };

  const or = (): Value => {
    let l = and();
    while (isOp("||")) {
      p++;
      const r = and();
      l = truthy(l) ? l : r;
    }
    return l;
  };
  const and = (): Value => {
    let l = eq();
    while (isOp("&&")) {
      p++;
      const r = eq();
      l = truthy(l) ? r : l;
    }
    return l;
  };
  const eq = (): Value => {
    let l = cmp();
    while (isOp("==") || isOp("!=")) {
      const op = toks[p++].v;
      const r = cmp();
      l = op === "==" ? looseEquals(l, r) : !looseEquals(l, r);
    }
    return l;
  };
  const cmp = (): Value => {
    let l = unary();
    while (isOp("<") || isOp(">") || isOp("<=") || isOp(">=")) {
      const op = toks[p++].v;
      const r = unary();
      const a = Number(l);
      const b = Number(r);
      l = op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
    }
    return l;
  };
  const unary = (): Value => {
    if (isOp("!")) {
      p++;
      return !truthy(unary());
    }
    return postfix();
  };
  const postfix = (): Value => {
    let v = primary();
    for (;;) {
      if (isOp(".")) {
        p++;
        const t = toks[p++];
        if (!t || t.t !== "id") throw new ExpressionError("se esperaba un nombre después del punto");
        v = v && typeof v === "object" && !Array.isArray(v) ? (v[t.v] ?? null) : null;
      } else if (isOp("[")) {
        p++;
        const k = or();
        expect("]");
        if (Array.isArray(v)) v = v[Number(k)] ?? null;
        else if (v && typeof v === "object") v = v[str(k)] ?? null;
        else v = null;
      } else return v;
    }
  };
  const primary = (): Value => {
    const t = toks[p++];
    if (!t) throw new ExpressionError("la expresión está incompleta");
    if (t.t === "str" || t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") {
      const v = or();
      expect(")");
      return v;
    }
    if (t.t === "id") {
      if (t.v === "true") return true;
      if (t.v === "false") return false;
      if (t.v === "null") return null;
      if (isOp("(")) {
        p++;
        const args: Value[] = [];
        while (!isOp(")")) {
          args.push(or());
          if (isOp(",")) p++;
          else if (!isOp(")")) throw new ExpressionError("se esperaba «,» o «)»");
        }
        p++;
        return call(t.v, args, status);
      }
      if (!(t.v in ctx)) throw new ExpressionError(`contexto desconocido «${t.v}»`);
      return ctx[t.v];
    }
    throw new ExpressionError(`símbolo inesperado «${t.v}»`);
  };

  const v = or();
  if (p < toks.length) throw new ExpressionError(`sobra «${(toks[p] as { v: unknown }).v}» al final`);
  return v;
}

function call(name: string, args: Value[], status: StatusFns): Value {
  const n = name.toLowerCase();
  switch (n) {
    case "startswith":
      return str(args[0]).toLowerCase().startsWith(str(args[1]).toLowerCase());
    case "endswith":
      return str(args[0]).toLowerCase().endsWith(str(args[1]).toLowerCase());
    case "contains":
      return Array.isArray(args[0])
        ? args[0].some((x) => looseEquals(x, args[1]))
        : str(args[0]).toLowerCase().includes(str(args[1]).toLowerCase());
    case "format":
      return str(args[0]).replace(/\{(\d+)\}/g, (_, i) => str(args[Number(i) + 1]));
    case "tojson":
      return JSON.stringify(args[0], null, 2);
    case "success":
      return !status.failed;
    case "failure":
      return status.failed;
    case "always":
      return true;
    case "cancelled":
      return false;
    default:
      throw new ExpressionError(`función desconocida «${name}»`);
  }
}

/** Replaces every ${{ … }} in a string. Errors are reported, not thrown. */
export function interpolate(text: string, ctx: Contexts, status?: StatusFns): { text: string; error?: string } {
  let error: string | undefined;
  const result = text.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr: string) => {
    try {
      return str(evaluate(expr, ctx, status));
    } catch (e) {
      error ??= `\${{${expr}}}: ${(e as Error).message}`;
      return "";
    }
  });
  return { text: result, error };
}

/** An `if:` condition; the ${{ }} wrapper is optional, as in GitHub. */
export function evaluateCondition(cond: unknown, ctx: Contexts, status: StatusFns): boolean {
  if (cond === undefined || cond === null) return !status.failed;
  if (typeof cond === "boolean") return cond;
  let src = String(cond).trim();
  const m = src.match(/^\$\{\{([\s\S]*)\}\}$/);
  if (m) src = m[1];
  // Without a status function, GitHub adds an implicit success() &&.
  const usesStatus = /\b(success|failure|always|cancelled)\s*\(/i.test(src);
  const v = truthy(evaluate(src, ctx, status));
  return usesStatus ? v : !status.failed && v;
}
