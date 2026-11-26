"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type ApplicationForm,
  type FormQuestion,
  type QuestionType,
  type BranchOp,
  QUESTION_TYPE_LABELS,
  CANDIDATE_FIELDS,
} from "@/lib/recruitmentForm";

const TYPES_WITH_OPTIONS: QuestionType[] = ["single_select", "multi_select"];
const BRANCH_OPS: { value: BranchOp; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "notEquals", label: "is not" },
  { value: "includes", label: "includes" },
  { value: "answered", label: "is answered" },
];

function newId() {
  return "q_" + Math.random().toString(36).slice(2, 8);
}

export function FormEditor({
  initialForm,
  origin,
}: {
  initialForm: ApplicationForm;
  origin: string;
}) {
  const [title, setTitle] = useState(initialForm.title);
  const [intro, setIntro] = useState(initialForm.intro);
  const [thankYou, setThankYou] = useState(initialForm.thankYou);
  const [sourceLabel, setSourceLabel] = useState(initialForm.sourceLabel);
  const [enabled, setEnabled] = useState(initialForm.enabled);
  const [slug, setSlug] = useState(initialForm.slug);
  const [questions, setQuestions] = useState<FormQuestion[]>(initialForm.questions);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const shareLink = slug ? `${origin}/apply/${slug}` : "";

  function patchQuestion(idx: number, patch: Partial<FormQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { id: newId(), label: "Untitled question", type: "short_text", required: false },
    ]);
  }
  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  async function rotateSlug() {
    if (!confirm("Regenerate the share link? The current link will stop working.")) return;
    try {
      const res = await fetch("/recruitment/api/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const body = await res.json();
      if (res.ok && body.slug) {
        setSlug(body.slug);
        setStatus({ kind: "ok", msg: "New share link generated." });
      } else {
        setStatus({ kind: "err", msg: "Could not regenerate the link." });
      }
    } catch {
      setStatus({ kind: "err", msg: "Could not regenerate the link." });
    }
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    // Clean options (drop blank lines) before saving.
    const cleaned = questions.map((q) => ({
      ...q,
      options: q.options ? q.options.map((o) => o).filter((o) => o.trim() !== "") : undefined,
      visibleWhen: q.visibleWhen && q.visibleWhen.questionId ? q.visibleWhen : null,
    }));
    try {
      const res = await fetch("/recruitment/api/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, intro, thankYou, enabled, sourceLabel, questions: cleaned }),
      });
      if (res.ok) {
        setStatus({ kind: "ok", msg: "Saved." });
      } else {
        const body = await res.json().catch(() => null);
        setStatus({ kind: "err", msg: body?.error || "Save failed." });
      }
    } catch {
      setStatus({ kind: "err", msg: "Save failed — check your connection." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-ink-50">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Link href="/recruitment" className="text-xs font-medium text-ink-500 hover:text-ink-900">
              ← Back to pipeline
            </Link>
            <h1 className="mt-1 text-lg font-semibold text-ink-900">Application form</h1>
            <p className="text-sm text-ink-500">
              The questionnaire applicants fill in. Edit questions, branching and the share link.
            </p>
          </div>
        </div>

        {/* Share link + status */}
        <section className="mb-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-900">Share link</h2>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Form is {enabled ? "live" : "off"}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shareLink}
              className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700"
            />
            <button
              onClick={copyLink}
              type="button"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={rotateSlug}
              type="button"
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50"
            >
              Regenerate
            </button>
          </div>
          {!enabled && (
            <p className="mt-2 text-xs text-gold-700">
              While off, the link shows “not available” to anyone who opens it.
            </p>
          )}
        </section>

        {/* Form settings */}
        <section className="mb-4 space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-900">Form details</h2>
          <Field label="Title">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Intro text (shown at the top)">
            <textarea rows={3} className={inputCls} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </Field>
          <Field label="Thank-you message (shown after submitting)">
            <textarea rows={2} className={inputCls} value={thankYou} onChange={(e) => setThankYou(e.target.value)} />
          </Field>
          <Field label="Source label (tags each applicant on the board)">
            <input className={inputCls} value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} />
          </Field>
        </section>

        {/* Questions */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Questions ({questions.length})</h2>
            <button
              onClick={addQuestion}
              type="button"
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              + Add question
            </button>
          </div>

          {questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              q={q}
              idx={idx}
              total={questions.length}
              earlier={questions.slice(0, idx)}
              onChange={(patch) => patchQuestion(idx, patch)}
              onRemove={() => removeQuestion(idx)}
              onMove={(dir) => moveQuestion(idx, dir)}
            />
          ))}
        </section>

        {/* Save bar */}
        <div className="sticky bottom-0 mt-5 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/90 p-3 shadow-sm backdrop-blur">
          <div className="text-sm">
            {status && (
              <span className={status.kind === "ok" ? "text-teal-700" : "text-red-700"}>{status.msg}</span>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving}
            type="button"
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save form"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      {children}
    </label>
  );
}

function QuestionCard({
  q,
  idx,
  total,
  earlier,
  onChange,
  onRemove,
  onMove,
}: {
  q: FormQuestion;
  idx: number;
  total: number;
  earlier: FormQuestion[];
  onChange: (patch: Partial<FormQuestion>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const hasOptions = TYPES_WITH_OPTIONS.includes(q.type);
  const branchOn = !!q.visibleWhen && !!q.visibleWhen.questionId;
  const refQuestion = earlier.find((e) => e.id === q.visibleWhen?.questionId);

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-2 text-xs font-semibold text-ink-400">{idx + 1}</span>
        <input
          className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          value={q.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Question text"
        />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={idx === 0} title="Move up" className="rounded px-1.5 py-1 text-ink-400 hover:bg-ink-50 disabled:opacity-30">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={idx === total - 1} title="Move down" className="rounded px-1.5 py-1 text-ink-400 hover:bg-ink-50 disabled:opacity-30">↓</button>
          <button type="button" onClick={onRemove} title="Delete" className="rounded px-1.5 py-1 text-red-500 hover:bg-red-50">✕</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Type</span>
          <select
            className={inputCls}
            value={q.type}
            onChange={(e) => onChange({ type: e.target.value as QuestionType })}
          >
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
              <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Saves to candidate field</span>
          <select
            className={inputCls}
            value={q.mapTo ?? ""}
            onChange={(e) => onChange({ mapTo: e.target.value })}
          >
            {CANDIDATE_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!q.required} onChange={(e) => onChange({ required: e.target.checked })} />
          Required
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          value={q.help ?? ""}
          onChange={(e) => onChange({ help: e.target.value })}
          placeholder="Help text (optional)"
        />
      </div>

      {hasOptions && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Options (one per line)</span>
          <textarea
            rows={Math.min(8, Math.max(3, (q.options?.length ?? 0) + 1))}
            className={inputCls}
            value={(q.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n") })}
          />
        </label>
      )}

      {/* Branching */}
      <div className="mt-3 rounded-lg bg-ink-50 p-3">
        <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            disabled={earlier.length === 0}
            checked={branchOn}
            onChange={(e) =>
              onChange({
                visibleWhen: e.target.checked
                  ? { questionId: earlier[0]?.id ?? "", op: "equals", value: "" }
                  : null,
              })
            }
          />
          Show only if an earlier answer matches
          {earlier.length === 0 && <span className="text-ink-400">(needs a question before it)</span>}
        </label>

        {branchOn && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className={inputCls}
              value={q.visibleWhen?.questionId ?? ""}
              onChange={(e) => onChange({ visibleWhen: { ...(q.visibleWhen ?? { op: "equals" }), questionId: e.target.value } as FormQuestion["visibleWhen"] })}
            >
              {earlier.map((e) => (
                <option key={e.id} value={e.id}>{e.label || e.id}</option>
              ))}
            </select>
            <select
              className={inputCls}
              value={q.visibleWhen?.op ?? "equals"}
              onChange={(e) => onChange({ visibleWhen: { ...(q.visibleWhen as NonNullable<FormQuestion["visibleWhen"]>), op: e.target.value as BranchOp } })}
            >
              {BRANCH_OPS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {q.visibleWhen?.op !== "answered" &&
              (refQuestion?.options && refQuestion.options.length > 0 ? (
                <select
                  className={inputCls}
                  value={q.visibleWhen?.value ?? ""}
                  onChange={(e) => onChange({ visibleWhen: { ...(q.visibleWhen as NonNullable<FormQuestion["visibleWhen"]>), value: e.target.value } })}
                >
                  <option value="">Select…</option>
                  {refQuestion.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  value={q.visibleWhen?.value ?? ""}
                  onChange={(e) => onChange({ visibleWhen: { ...(q.visibleWhen as NonNullable<FormQuestion["visibleWhen"]>), value: e.target.value } })}
                  placeholder="value"
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
