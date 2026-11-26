import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, type Command } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import type { Diagnostic } from "../../sim/workflow";

// CodeMirror 6 with the "terminal nocturna" palette and GitHub-like diagnostics as lint marks.

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--surface)", color: "var(--text)", borderRadius: "0 0 12px 12px" },
    ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
    ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--muted)", border: "none" },
    ".cm-activeLine": { backgroundColor: "#1c222b" },
    ".cm-activeLineGutter": { backgroundColor: "#1c222b", color: "var(--text-2)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "#264f78 !important" },
    ".cm-tooltip": { backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" },
    ".cm-tooltip-lint": { fontFamily: "var(--sans)", fontSize: "13px" },
    ".cm-diagnostic-error": { borderLeftColor: "var(--error)" },
    ".cm-diagnostic-warning": { borderLeftColor: "var(--reward)" },
    ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--error)", textUnderlineOffset: "4px" },
    ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--reward)", textUnderlineOffset: "4px" },
    ".cm-matchingBracket": { backgroundColor: "#2e6b3a66", outline: "none" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--border)", border: "none", color: "var(--text)" },
    ".cm-panels": { backgroundColor: "var(--bg)", color: "var(--text)" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#79c0ff" },
  { tag: [t.string, t.special(t.string)], color: "#a5d6ff" },
  { tag: [t.number, t.bool, t.null], color: "#ffa657" },
  { tag: t.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.keyword, t.operator, t.punctuation, t.separator], color: "var(--text-2)" },
  { tag: t.meta, color: "var(--reward)" },
]);

/** Enter keeps the indentation and adds two spaces after "clave:", as YAML needs. */
const yamlEnter: Command = (view) => {
  const range = view.state.selection.main;
  if (!range.empty) return false;
  const line = view.state.doc.lineAt(range.head);
  const before = line.text.slice(0, range.head - line.from);
  const indent = /^\s*/.exec(before)![0];
  const insert = "\n" + indent + (/:\s*$/.test(before) ? "  " : "");
  view.dispatch({
    changes: { from: range.head, to: range.head, insert },
    selection: { anchor: range.head + insert.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};

export interface CodeEditorHandle {
  goToLine(line: number): void;
}

export function CodeEditor({
  value,
  onChange,
  diagnostics,
  label,
  handleRef,
}: {
  value: string;
  onChange: (v: string) => void;
  diagnostics: Diagnostic[];
  label: string;
  handleRef?: React.MutableRefObject<CodeEditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diagRef = useRef(diagnostics);
  diagRef.current = diagnostics;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const lint = linter(
      (v) =>
        diagRef.current.map((d): CmDiagnostic => {
          const line = v.state.doc.line(Math.min(Math.max(d.line ?? 1, 1), v.state.doc.lines));
          const from = line.from + (line.text.length - line.text.trimStart().length);
          return { from, to: Math.max(from + 1, line.to), severity: d.severity, message: d.message };
        }),
      { delay: 250 },
    );
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          Prec.high(keymap.of([{ key: "Enter", run: yamlEnter }])),
          keymap.of([indentWithTab]),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          yaml(),
          theme,
          syntaxHighlighting(highlight),
          lintGutter(),
          lint,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (handleRef)
      handleRef.current = {
        goToLine(n) {
          const line = v.state.doc.line(Math.min(Math.max(n, 1), v.state.doc.lines));
          v.dispatch({ selection: { anchor: line.from + (line.text.length - line.text.trimStart().length) }, scrollIntoView: true });
          v.focus();
        },
      };
    return () => v.destroy();
    // The editor is created once; outside changes arrive through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document when the value changes from outside (reset, solution).
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="editor-wrap" />;
}
