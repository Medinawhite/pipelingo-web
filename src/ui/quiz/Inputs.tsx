import { useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  FillCommandQuestion,
  FindErrorQuestion,
  MatchQuestion,
  MultipleChoiceQuestion,
  OrderStepsQuestion,
} from "../../content/types";
import { normalizeBlank } from "../../domain/grading";
import type { PreparedQuestion } from "../../domain/quizBuilder";
import { ArrowDown, ArrowUp, Grip } from "../icons";
import { S } from "../strings";
import { highlight } from "./highlight";

export const LETTERS = "abcdef";

/** The learner's answer while it is being built. */
export type Draft =
  | { kind: "choice"; optionId: string | null }
  | { kind: "bool"; value: boolean | null }
  | { kind: "matches"; pairs: Record<string, string> }
  | { kind: "blanks"; values: Record<string, string> }
  | { kind: "lines"; lines: number[] }
  | { kind: "order"; stepIds: string[] };

export function emptyDraft(p: PreparedQuestion): Draft {
  switch (p.question.type) {
    case "multiple_choice":
      return { kind: "choice", optionId: null };
    case "true_false":
      return { kind: "bool", value: null };
    case "match":
      return { kind: "matches", pairs: {} };
    case "fill_command":
      return { kind: "blanks", values: {} };
    case "find_error":
      return { kind: "lines", lines: [] };
    case "order_steps":
      return { kind: "order", stepIds: p.stepOrder };
  }
}

export function isReady(p: PreparedQuestion, d: Draft): boolean {
  switch (d.kind) {
    case "choice":
      return d.optionId !== null;
    case "bool":
      return d.value !== null;
    case "matches":
      return Object.keys(d.pairs).length === (p.question as MatchQuestion).pairs.length;
    case "blanks":
      return Object.keys((p.question as FillCommandQuestion).blanks).every((b) => (d.values[b] ?? "").trim() !== "");
    case "lines":
      return d.lines.length > 0;
    case "order":
      return true;
  }
}

interface InputProps<D extends Draft> {
  prepared: PreparedQuestion;
  draft: D;
  onChange: (d: D) => void;
  /** After checking: inputs are read-only and show right and wrong. */
  revealed: boolean;
}

// ---------- multiple_choice ----------

export function ChoiceInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "choice" }>>) {
  const q = prepared.question as MultipleChoiceQuestion;
  return (
    <div className="options" role="radiogroup" aria-label="Opciones">
      {prepared.optionOrder.map((id, i) => {
        const o = q.options.find((x) => x.id === id)!;
        const selected = draft.optionId === id;
        const cls = revealed ? (id === q.answer ? "correct" : selected ? "wrong" : "") : "";
        return (
          <button
            key={id}
            role="radio"
            aria-checked={selected}
            className={`option ${cls}`}
            disabled={revealed}
            onClick={() => onChange({ kind: "choice", optionId: id })}
          >
            <span className="letter" aria-hidden="true">
              {LETTERS[i]}
            </span>
            <span>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- true_false ----------

export function BoolInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "bool" }>>) {
  const answer = prepared.question.type === "true_false" ? prepared.question.answer : null;
  return (
    <div className="tf" role="radiogroup" aria-label="Verdadero o falso">
      {[true, false].map((v) => {
        const selected = draft.value === v;
        const cls = revealed ? (v === answer ? "correct" : selected ? "wrong" : "") : "";
        return (
          <button
            key={String(v)}
            role="radio"
            aria-checked={selected}
            className={`option ${cls}`}
            disabled={revealed}
            onClick={() => onChange({ kind: "bool", value: v })}
          >
            {v ? S.quiz.true : S.quiz.false}
          </button>
        );
      })}
    </div>
  );
}

// ---------- match ----------

export function MatchInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "matches" }>>) {
  const q = prepared.question as MatchQuestion;
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const rightToLeft = Object.fromEntries(Object.entries(draft.pairs).map(([l, r]) => [r, l]));
  const pairNumber = (l: string) => Object.keys(draft.pairs).indexOf(l) + 1;

  const link = (l: string, r: string) => {
    const pairs = { ...draft.pairs };
    for (const [k, v] of Object.entries(pairs)) if (k === l || v === r) delete pairs[k];
    pairs[l] = r;
    onChange({ kind: "matches", pairs });
    setLeft(null);
    setRight(null);
  };
  const tapLeft = (l: string) => {
    if (draft.pairs[l] && left !== l) {
      // Tapping a paired item unpairs it.
      const pairs = { ...draft.pairs };
      delete pairs[l];
      onChange({ kind: "matches", pairs });
      setLeft(l);
      return;
    }
    if (right) link(l, right);
    else setLeft(left === l ? null : l);
  };
  const tapRight = (r: string) => {
    const owner = rightToLeft[r];
    if (owner && right !== r) {
      const pairs = { ...draft.pairs };
      delete pairs[owner];
      onChange({ kind: "matches", pairs });
      setRight(r);
      return;
    }
    if (left) link(left, r);
    else setRight(right === r ? null : r);
  };
  const correctRight = Object.fromEntries(q.pairs.map((p) => [p.left, p.right]));
  return (
    <>
      <p className="section-label">{S.quiz.matchHelp}</p>
      <div className="match">
        <div className="match-col">
          {q.pairs.map((p) => {
            const paired = draft.pairs[p.left];
            const cls = revealed ? (paired === correctRight[p.left] ? "correct" : "wrong") : paired ? "paired" : "";
            return (
              <button
                key={p.left}
                className={`option mono ${cls}`}
                aria-pressed={left === p.left}
                disabled={revealed}
                aria-label={paired ? `${p.left}, ${S.quiz.pairedWith(paired)}` : p.left}
                onClick={() => tapLeft(p.left)}
              >
                <span>{p.left}</span>
                {paired && <span className="pair-badge">{pairNumber(p.left)}</span>}
              </button>
            );
          })}
        </div>
        <div className="match-col">
          {prepared.rightColumn.map((r) => {
            const owner = rightToLeft[r];
            const cls = revealed ? (owner && correctRight[owner] === r ? "correct" : "wrong") : owner ? "paired" : "";
            return (
              <button
                key={r}
                className={`option ${cls}`}
                aria-pressed={right === r}
                disabled={revealed}
                aria-label={owner ? `${r}, ${S.quiz.pairedWith(owner)}` : r}
                onClick={() => tapRight(r)}
              >
                <span>{r}</span>
                {owner && <span className="pair-badge">{pairNumber(owner)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------- fill_command ----------

const SYMBOLS = ["-", ":", ".", "/", "--"];

export function isYamlTemplate(t: string) {
  return /^(\s*-\s|[\w{}.-]+:)/.test(t) && !/^(docker|git|helm|oc|kubectl|npm|curl)\b/.test(t);
}

export function FillInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "blanks" }>>) {
  const q = prepared.question as FillCommandQuestion;
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focused, setFocused] = useState<string>(Object.keys(q.blanks)[0]);
  const parts = q.template.split(/(\{\{\w+\}\})/);
  const yaml = isYamlTemplate(q.template);
  const set = (name: string, v: string) => onChange({ kind: "blanks", values: { ...draft.values, [name]: v } });
  const insert = (sym: string) => {
    const el = refs.current[focused];
    if (!el) return;
    const v = draft.values[focused] ?? "";
    const start = el.selectionStart ?? v.length;
    const end = el.selectionEnd ?? v.length;
    set(focused, v.slice(0, start) + sym + v.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  };
  let n = 0;
  return (
    <div className="term">
      <div className="term-head" aria-hidden="true">
        <span className="dot" style={{ background: "var(--error)" }} />
        <span className="dot" style={{ background: "var(--reward)" }} />
        <span className="dot" style={{ background: "var(--accent)" }} />
        <span className="title">{yaml ? "yaml" : "bash"}</span>
      </div>
      <div className="term-body">
        <div className="fill-line">
          {!yaml && <span style={{ color: "var(--accent)" }}>$</span>}
          {parts.map((part, i) => {
            const m = part.match(/^\{\{(\w+)\}\}$/);
            if (!m) return part ? <span key={i} style={{ whiteSpace: "pre" }}>{part}</span> : null;
            const name = m[1];
            n++;
            const v = draft.values[name] ?? "";
            const ok = q.blanks[name].some((a) => normalizeBlank(a) === normalizeBlank(v));
            return (
              <input
                key={i}
                ref={(el) => {
                  refs.current[name] = el;
                }}
                className={`fill-input ${revealed ? (ok ? "correct" : "wrong") : ""}`}
                aria-label={S.quiz.blank(n)}
                value={v}
                readOnly={revealed}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                size={Math.max(4, v.length + 1)}
                onFocus={() => setFocused(name)}
                onChange={(e) => set(name, e.target.value)}
              />
            );
          })}
        </div>
      </div>
      {!revealed && (
        <div className="symbols" style={{ padding: "0 14px 14px" }}>
          {SYMBOLS.map((s) => (
            <button key={s} type="button" aria-label={S.quiz.insert(s)} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- find_error ----------

export function LinesInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "lines" }>>) {
  const q = prepared.question as FindErrorQuestion;
  const toggle = (n: number) =>
    onChange({ kind: "lines", lines: draft.lines.includes(n) ? draft.lines.filter((x) => x !== n) : [...draft.lines, n] });
  return (
    <>
      <p className="section-label">{S.quiz.tapLine}</p>
      <div className="code" style={{ padding: 6 }}>
        {q.code.content.split("\n").map((line, i) => {
          const n = i + 1;
          const selected = draft.lines.includes(n);
          const cls = revealed ? (q.answer.includes(n) ? "correct" : selected ? "wrong" : "") : "";
          return (
            <button
              key={n}
              className={`code-line ${cls}`}
              aria-pressed={selected}
              aria-label={S.quiz.lineLabel(n, line.trim() || "vacía")}
              disabled={revealed}
              onClick={() => toggle(n)}
            >
              <span className="ln" aria-hidden="true">
                {n}
              </span>
              <span>{highlight(line, q.code.lang)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------- order_steps ----------

function SortableStep({
  id,
  text,
  index,
  count,
  revealed,
  correct,
  move,
}: {
  id: string;
  text: string;
  index: number;
  count: number;
  revealed: boolean;
  correct: boolean | null;
  move: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: revealed });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const cls = correct === null ? "" : correct ? "correct" : "wrong";
  return (
    <li ref={setNodeRef} style={style} className={`step ${isDragging ? "dragging" : ""} ${cls}`}>
      <button className="grip" {...attributes} {...listeners} aria-label={`${S.quiz.drag}: ${text}`} disabled={revealed}>
        <Grip size={18} />
      </button>
      <span className="step-num" aria-hidden="true">
        {index + 1}
      </span>
      <span className="text">{text}</span>
      {!revealed && (
        <>
          <button className="icon-btn" aria-label={`${S.quiz.moveUp}: ${text}`} disabled={index === 0} onClick={() => move(index, index - 1)}>
            <ArrowUp />
          </button>
          <button className="icon-btn" aria-label={`${S.quiz.moveDown}: ${text}`} disabled={index === count - 1} onClick={() => move(index, index + 1)}>
            <ArrowDown />
          </button>
        </>
      )}
    </li>
  );
}

export function OrderInput({ prepared, draft, onChange, revealed }: InputProps<Extract<Draft, { kind: "order" }>>) {
  const q = prepared.question as OrderStepsQuestion;
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (from: number, to: number) => onChange({ kind: "order", stepIds: arrayMove(draft.stepIds, from, to) });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(draft.stepIds.indexOf(String(e.active.id)), draft.stepIds.indexOf(String(e.over.id)));
  };
  const solutions = [q.answer, ...(q.acceptAlso ?? [])];
  const isSolution = solutions.some((s) => s.every((x, i) => x === draft.stepIds[i]));
  return (
    <>
      <p className="section-label">{S.quiz.orderHelp}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.stepIds} strategy={verticalListSortingStrategy}>
          <ol className="steps" aria-label="Pasos">
            {draft.stepIds.map((id, i) => (
              <SortableStep
                key={id}
                id={id}
                index={i}
                count={draft.stepIds.length}
                text={q.steps.find((s) => s.id === id)!.text}
                revealed={revealed}
                correct={revealed ? isSolution || q.answer[i] === id : null}
                move={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </>
  );
}
