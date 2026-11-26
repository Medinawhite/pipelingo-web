import type { ReactNode } from "react";

// Minimal, dependency-free highlighting for short code blocks (YAML, Dockerfile, shell).
export function highlight(line: string, lang: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = line;
  let k = 0;
  const push = (text: string, cls?: string) => {
    if (!text) return;
    nodes.push(cls ? <span key={k++} className={cls}>{text}</span> : <span key={k++}>{text}</span>);
  };
  // Comment at the start of a line (or after spaces).
  const comment = rest.match(/^(\s*)(#.*)$/);
  if (comment) {
    push(comment[1]);
    push(comment[2], "tok-com");
    return nodes;
  }
  if (lang === "dockerfile") {
    const m = rest.match(/^(\s*)([A-Z]+)(\b.*)$/);
    if (m) {
      push(m[1]);
      push(m[2], "tok-kw");
      rest = m[3];
    }
  } else if (lang === "yaml" || lang === "yml") {
    const m = rest.match(/^(\s*-?\s*)([\w./-]+)(:)(\s|$)/);
    if (m) {
      push(m[1]);
      push(m[2], "tok-key");
      push(m[3]);
      rest = rest.slice(m[1].length + m[2].length + 1);
    }
  }
  // Expressions and strings in what is left.
  const re = /(\$\{\{.*?\}\}|"[^"]*"|'[^']*')/g;
  let last = 0;
  for (const m of rest.matchAll(re)) {
    push(rest.slice(last, m.index));
    push(m[0], m[0].startsWith("${{") ? "tok-expr" : "tok-str");
    last = m.index! + m[0].length;
  }
  push(rest.slice(last));
  return nodes;
}

export function CodeBlock({ content, lang }: { content: string; lang: string }) {
  return (
    <div className="code" role="group" aria-label={`Código ${lang}`}>
      {content.split("\n").map((l, i) => (
        <div className="code-line" key={i}>
          <span className="ln" aria-hidden="true">
            {i + 1}
          </span>
          <span>{highlight(l, lang)}</span>
        </div>
      ))}
    </div>
  );
}
