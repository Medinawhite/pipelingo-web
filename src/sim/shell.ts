/** One line of terminal output. */
export interface OutLine {
  text: string;
  tone?: "err" | "muted" | "ok" | "warn";
}

/** Splits a command line into words, honouring single and double quotes. */
export function tokenize(line: string): string[] {
  const words: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) words.push(cur);
      cur = "";
      has = false;
    } else cur += ch;
  }
  if (has || cur) words.push(cur);
  return words;
}

export const out = (text: string, tone?: OutLine["tone"]): OutLine => (tone ? { text, tone } : { text });

/** Left-aligns columns like `docker ps` does (three spaces between columns). */
export function table(rows: string[][]): string[] {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => (r[c] ?? "").length)));
  return rows.map((r) =>
    r
      .map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c] + 3)))
      .join("")
      .trimEnd(),
  );
}
