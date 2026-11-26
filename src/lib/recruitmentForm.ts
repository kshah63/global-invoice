import { COUNTRIES } from "@/lib/countries";

// =====================================================================
// Recruitment application form — shared schema, defaults and helpers.
//
// Pure module (no server-only imports) so it can be used by the public
// applicant page/route AND the HR editor client component.
// =====================================================================

export type QuestionType =
  | "short_text"
  | "phone"
  | "email"
  | "long_text"
  | "number"
  | "date"
  | "single_select"
  | "multi_select"
  | "yes_no";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  phone: "Phone number",
  email: "Email",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  yes_no: "Yes / No",
};

export type BranchOp = "equals" | "notEquals" | "includes" | "answered";

export interface BranchCondition {
  questionId: string;
  op: BranchOp;
  value?: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  help?: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  /** Candidate field this answer fills (e.g. "name", "whatsapp"). */
  mapTo?: string;
  /** Show this question only when the condition passes (branching). */
  visibleWhen?: BranchCondition | null;
}

export interface ApplicationForm {
  slug: string;
  title: string;
  intro: string;
  thankYou: string;
  enabled: boolean;
  sourceLabel: string;
  questions: FormQuestion[];
}

/** Raw DB row shape for recruitment_form. */
export interface ApplicationFormRow {
  slug: string;
  title: string | null;
  intro: string | null;
  thank_you: string | null;
  enabled: boolean | null;
  source_label: string | null;
  schema: unknown;
}

/** Candidate fields a question can map onto (drives the editor's mapTo list). */
export const CANDIDATE_FIELDS: { value: string; label: string }[] = [
  { value: "", label: "— not mapped —" },
  { value: "name", label: "Full name" },
  { value: "whatsapp", label: "Phone / WhatsApp" },
  { value: "email", label: "Email" },
  { value: "yob", label: "Year of birth" },
  { value: "isStudying", label: "Currently studying (Yes/No)" },
  { value: "currEducation", label: "Current education" },
  { value: "institute", label: "Institute" },
  { value: "qualification", label: "Highest qualification" },
  { value: "school", label: "School / college / university" },
  { value: "nationality", label: "Nationality" },
  { value: "visaStatus", label: "Visa status" },
  { value: "position", label: "Position applying for" },
  { value: "subjects", label: "Teaching subjects" },
  { value: "remarks", label: "Remarks / notes" },
];

// Starter questionnaire — mirrors the MathVision (Supreme HR) Google form,
// including the two branches. Fully editable from the HR editor afterwards.
export const DEFAULT_QUESTIONS: FormQuestion[] = [
  { id: "name", label: "Full Name", help: "(As per NRIC)", type: "short_text", required: true, mapTo: "name" },
  { id: "whatsapp", label: "Phone number", help: "(Kindly add your country code)", type: "phone", required: true, mapTo: "whatsapp" },
  { id: "yob", label: "Year of Birth", type: "short_text", required: true, mapTo: "yob" },
  { id: "isStudying", label: "Are you currently studying?", type: "single_select", required: true, options: ["Yes", "No"], mapTo: "isStudying" },
  { id: "currEducation", label: "Current Education", type: "short_text", required: true, mapTo: "currEducation", visibleWhen: { questionId: "isStudying", op: "equals", value: "Yes" } },
  { id: "institute", label: "Name of Institute", type: "short_text", required: true, mapTo: "institute", visibleWhen: { questionId: "isStudying", op: "equals", value: "Yes" } },
  { id: "qualification", label: "Highest Education Qualification", type: "short_text", required: true, mapTo: "qualification", visibleWhen: { questionId: "isStudying", op: "equals", value: "No" } },
  { id: "school", label: "Name of School / Institute / College / University", type: "short_text", required: true, mapTo: "school", visibleWhen: { questionId: "isStudying", op: "equals", value: "No" } },
  { id: "nationality", label: "Nationality", type: "single_select", required: true, options: COUNTRIES, mapTo: "nationality" },
  { id: "visaStatus", label: "Visa status in Singapore", type: "single_select", required: true, options: ["Citizen", "PR", "Student Pass", "LOC/Pre-LOC", "Others"], mapTo: "visaStatus" },
  { id: "position", label: "Which position are you applying for?", type: "single_select", required: true, options: ["Teacher", "Admin", "IT & Facilities", "Campus Ambassador"], mapTo: "position" },
  { id: "subjects", label: "What would be your strongest teaching subject(s)?", type: "multi_select", required: true, options: ["Math", "Physics", "Chemistry", "Biology", "Computer Science", "Economics", "Business"], mapTo: "subjects", visibleWhen: { questionId: "position", op: "equals", value: "Teacher" } },
];

/** Build an ApplicationForm from a DB row, falling back to the app default. */
export function effectiveForm(row: ApplicationFormRow): ApplicationForm {
  const schema = row.schema;
  const questions =
    Array.isArray(schema) && schema.length > 0
      ? (schema as FormQuestion[])
      : DEFAULT_QUESTIONS;
  return {
    slug: row.slug,
    title: row.title || "MathVision Application Form",
    intro: row.intro || "",
    thankYou: row.thank_you || "Thank you! Your application has been received.",
    enabled: row.enabled !== false,
    sourceLabel: row.source_label || "Application Form",
    questions,
  };
}

/** True when a question should be shown given the current answers. */
export function isQuestionVisible(
  q: FormQuestion,
  answers: Record<string, unknown>
): boolean {
  const cond = q.visibleWhen;
  if (!cond || !cond.questionId) return true;
  const raw = answers[cond.questionId];
  switch (cond.op) {
    case "answered":
      return Array.isArray(raw) ? raw.length > 0 : raw != null && String(raw).trim() !== "";
    case "notEquals":
      return String(raw ?? "") !== String(cond.value ?? "");
    case "includes":
      return Array.isArray(raw)
        ? raw.map(String).includes(String(cond.value ?? ""))
        : String(raw ?? "") === String(cond.value ?? "");
    case "equals":
    default:
      return String(raw ?? "") === String(cond.value ?? "");
  }
}

function isAnswered(q: FormQuestion, value: unknown): boolean {
  if (q.type === "multi_select") return Array.isArray(value) && value.length > 0;
  return value != null && String(value).trim() !== "";
}

/**
 * Validate a submission against the schema. Returns the ids of visible,
 * required questions that were left blank (hidden questions never block).
 */
export function validateSubmission(
  questions: FormQuestion[],
  answers: Record<string, unknown>
): string[] {
  const missing: string[] = [];
  for (const q of questions) {
    if (!q.required) continue;
    if (!isQuestionVisible(q, answers)) continue;
    if (!isAnswered(q, answers[q.id])) missing.push(q.id);
  }
  return missing;
}

function normalizeAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value == null ? "" : String(value);
}

function genId(): string {
  return "app_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Convert raw answers into a candidate-shaped object ready to drop onto the
 * pipeline board (Stage 1, "Form submitted"). Only mapped, visible, answered
 * questions populate candidate fields; the full raw answers are kept too.
 */
export function buildCandidateData(
  form: ApplicationForm,
  answers: Record<string, unknown>
): Record<string, unknown> {
  const now = new Date().toISOString();
  const candidate: Record<string, unknown> = {
    id: genId(),
    stage: "contacted",
    type: "",
    photo: "",
    sourceLabel: form.sourceLabel,
    appliedAt: now,
    createdAt: now,
    updatedAt: now,
    applicationAnswers: answers,
  };

  const remarksBits: string[] = [];
  for (const q of form.questions) {
    if (!isQuestionVisible(q, answers)) continue;
    const value = answers[q.id];
    if (!isAnswered(q, value)) continue;
    const norm = normalizeAnswer(value);
    if (q.mapTo && q.mapTo.trim() !== "") {
      candidate[q.mapTo] = norm;
    } else {
      remarksBits.push(`${q.label}: ${norm}`);
    }
  }
  if (remarksBits.length > 0) {
    const existing = typeof candidate.remarks === "string" ? candidate.remarks : "";
    candidate.remarks = [existing, remarksBits.join("\n")].filter(Boolean).join("\n");
  }
  return candidate;
}
