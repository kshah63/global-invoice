"use client";

import { useMemo, useState } from "react";
import {
  type ApplicationForm,
  type FormQuestion,
  isQuestionVisible,
  validateSubmission,
} from "@/lib/recruitmentForm";

type Answers = Record<string, unknown>;

export function ApplyForm({ form }: { form: ApplicationForm }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [hp, setHp] = useState(""); // honeypot

  const visibleQuestions = useMemo(
    () => form.questions.filter((q) => isQuestionVisible(q, answers)),
    [form.questions, answers]
  );

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (errors.has(id)) {
      setErrors((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const missing = validateSubmission(form.questions, answers);
    if (missing.length > 0) {
      setErrors(new Set(missing));
      const first = document.getElementById(`q-${missing[0]}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/apply/${form.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, hp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error === "missing" && Array.isArray(body.fields)) {
          setErrors(new Set(body.fields));
          setServerError("Please complete the highlighted questions.");
        } else {
          setServerError("Sorry, something went wrong. Please try again.");
        }
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setServerError("Couldn’t reach the server. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-ink-900">Application received</h1>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-500">{form.thankYou}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        {/* Brand header */}
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            MV
          </div>
          <span className="text-sm font-semibold tracking-tight text-ink-900">MathVision</span>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-ink-200 bg-white shadow-sm">
          {/* Accent bar */}
          <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-brand-600 to-gold-500" />
          <div className="p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-ink-900">{form.title}</h1>
            {form.intro && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-500">
                {form.intro}
              </p>
            )}

            <div className="mt-6 space-y-6">
              {visibleQuestions.map((q) => (
                <QuestionField
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  invalid={errors.has(q.id)}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              ))}
            </div>

            {/* Honeypot — hidden from real users */}
            <div aria-hidden className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
              <label>
                Company website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                />
              </label>
            </div>

            {serverError && (
              <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
            <p className="mt-3 text-center text-[11px] text-ink-400">
              Your details are sent securely to the MathVision team.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

function QuestionField({
  q,
  value,
  invalid,
  onChange,
}: {
  q: FormQuestion;
  value: unknown;
  invalid: boolean;
  onChange: (v: unknown) => void;
}) {
  const baseInput =
    "mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 " +
    (invalid ? "border-red-400 bg-red-50/40" : "border-ink-200");

  const str = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const useRadios =
    (q.type === "yes_no" || q.type === "single_select") &&
    (q.options?.length ?? 0) <= 6;

  return (
    <div id={`q-${q.id}`}>
      <label className="block text-sm font-medium text-ink-800">
        {q.label}
        {q.required && <span className="ml-1 text-gold-600">*</span>}
      </label>
      {q.help && <p className="mt-0.5 text-xs text-ink-400">{q.help}</p>}

      {(q.type === "short_text" || q.type === "phone" || q.type === "email" || q.type === "number") && (
        <input
          type={q.type === "phone" ? "tel" : q.type === "number" ? "number" : q.type === "email" ? "email" : "text"}
          className={baseInput}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {q.type === "date" && (
        <input type="date" className={baseInput} value={str} onChange={(e) => onChange(e.target.value)} />
      )}

      {q.type === "long_text" && (
        <textarea rows={3} className={baseInput} value={str} onChange={(e) => onChange(e.target.value)} />
      )}

      {(q.type === "yes_no" || q.type === "single_select") && !useRadios && (
        <select className={baseInput} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(q.type === "yes_no" ? ["Yes", "No"] : q.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {(q.type === "yes_no" || q.type === "single_select") && useRadios && (
        <div className={"mt-2 space-y-2 " + (invalid ? "rounded-lg border border-red-400 bg-red-50/40 p-2" : "")}>
          {(q.type === "yes_no" ? ["Yes", "No"] : q.options ?? []).map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              <input
                type="radio"
                name={q.id}
                className="h-4 w-4 accent-brand-600"
                checked={str === opt}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {q.type === "multi_select" && (
        <div className={"mt-2 space-y-2 " + (invalid ? "rounded-lg border border-red-400 bg-red-50/40 p-2" : "")}>
          {(q.options ?? []).map((opt) => {
            const checked = arr.includes(opt);
            return (
              <label key={opt} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? arr.filter((o) => o !== opt) : [...arr, opt])
                  }
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
