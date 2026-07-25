"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  CURRENCY_META,
  RATE_UNITS,
  RATE_UNIT_LABELS,
  SUBJECT_OPTIONS,
  TASKS,
  TASK_LABELS,
  type Currency,
  type RateUnit,
  type TaskType,
} from "@/lib/constants";
import {
  createTeamMember,
  updateTeamMember,
  type RateInput,
  type TeamMemberInput,
} from "@/actions/team-members";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Alert } from "@/components/ui/Feedback";

interface RateRow extends RateInput {
  key: string;
}

let seq = 0;
const key = () => `r-${seq++}-${Math.round(Math.random() * 1e6)}`;

function randomPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function TeamMemberForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: Partial<TeamMemberInput>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [employeeId, setEmployeeId] = useState(initial?.employee_id ?? "");
  const [password, setPassword] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp_number ?? "");
  const [dateJoined, setDateJoined] = useState(initial?.date_joined ?? "");
  const [nationality, setNationality] = useState(initial?.nationality ?? "");
  const [workLocation, setWorkLocation] = useState(initial?.work_location ?? "");
  const [hod, setHod] = useState(initial?.head_of_department ?? "");
  const [paymentDetails, setPaymentDetails] = useState(
    initial?.payment_details ?? ""
  );
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "SGD");
  const [fixedSalary, setFixedSalary] = useState(
    initial?.fixed_salary != null ? String(initial.fixed_salary) : ""
  );
  const [subjects, setSubjects] = useState<string[]>(initial?.subjects ?? []);
  const [rates, setRates] = useState<RateRow[]>(
    (initial?.rates ?? []).map((r) => ({ ...r, key: key() }))
  );

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function addRate() {
    setRates((prev) => [
      ...prev,
      {
        key: key(),
        descriptor: "",
        unit: "per_session",
        amount: 0,
        task: null,
        sort_order: prev.length,
      },
    ]);
  }
  function patchRate(k: string, patch: Partial<RateRow>) {
    setRates((prev) => prev.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  }
  function removeRate(k: string) {
    setRates((prev) => prev.filter((r) => r.key !== k));
  }

  function buildInput(): TeamMemberInput {
    return {
      name: name.trim(),
      email: email.trim() || null,
      employee_id: employeeId.trim(),
      whatsapp_number: whatsapp.trim() || null,
      date_joined: dateJoined || null,
      nationality: nationality.trim() || null,
      work_location: workLocation.trim() || null,
      head_of_department: hod.trim() || null,
      payment_details: paymentDetails.trim() || null,
      currency,
      fixed_salary: fixedSalary.trim() ? Number(fixedSalary) : null,
      subjects,
      rates: rates.map((r, i) => ({
        descriptor: r.descriptor,
        unit: r.unit,
        amount: Number(r.amount) || 0,
        task: r.task,
        sort_order: i,
      })),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^[0-9]{4}$/.test(employeeId.trim())) {
      setError("Employee ID must be a 4-digit code.");
      return;
    }
    const willEmail = email.trim().includes("@") && sendWelcomeEmail;
    if (mode === "create" && !willEmail && password.length < 8) {
      setError(
        email.trim().includes("@")
          ? "Set an initial password of at least 8 characters, or enable the welcome email."
          : "With no email, set an initial password of at least 8 characters."
      );
      return;
    }
    // A rate is only saved if it has a descriptor (it labels the rate in the
    // invoice dropdown). Catch a filled-in rate that's missing one, rather than
    // silently dropping it.
    const rateMissingDescriptor = rates.some(
      (r) => r.descriptor.trim() === "" && (Number(r.amount) > 0 || r.task !== null)
    );
    if (rateMissingDescriptor) {
      setError(
        'Every rate needs a descriptor (e.g. "Weekday teaching"). Add one, or remove the empty rate line.'
      );
      return;
    }
    setSaving(true);
    const input = buildInput();

    if (mode === "create") {
      // Create navigates to the new member's page on success; only returns on error.
      const res = await createTeamMember({ ...input, password, sendWelcomeEmail });
      if (res?.error) {
        setError(res.error);
        setSaving(false);
      }
      return;
    }

    // Edit stays on the same page, so handle success here (no redirect).
    const res = await updateTeamMember(id!, input);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setNotice("Changes saved.");
    router.refresh();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field
            label="Email (optional)"
            hint={
              mode === "edit"
                ? "For emailing invoices. Changing it doesn't change their login."
                : "Optional — they sign in by ID. Add one only for a set-password email / invoices."
            }
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Leave blank — they log in by ID"
            />
          </Field>
          <Field label="Employee ID (4 digits)" required hint="Their login and the invoice number.">
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              placeholder="1042"
              required
            />
          </Field>
          <Field label="WhatsApp number">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </Field>
          <Field label="Date joined">
            <Input
              type="date"
              value={dateJoined ?? ""}
              onChange={(e) => setDateJoined(e.target.value)}
            />
          </Field>
          <Field label="Nationality">
            <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </Field>
          <Field label="Work location">
            <Input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} />
          </Field>
          <Field label="Head of department">
            <Input value={hod} onChange={(e) => setHod(e.target.value)} />
          </Field>
          <Field label="Subjects" hint="Select all that apply.">
            <MultiSelect
              options={[...SUBJECT_OPTIONS]}
              value={subjects}
              onChange={setSubjects}
              placeholder="Select subjects"
            />
          </Field>
          <Field label="Payment details">
            <Textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="Bank / transfer details"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pay"
          description="Set a fixed salary and/or add rates. Rates appear as a dropdown in the team member's invoice line items."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice currency" required hint="Their rates/salary are set in this currency. Payment is transferred in SGD (OCBC rate on the day).">
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_META[c].label} ({c})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fixed salary (optional)" hint="Leave blank if paid only by rate.">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fixedSalary}
                onChange={(e) => setFixedSalary(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Rates (descriptor dropdown)</Label>
              <Button type="button" size="sm" variant="brand-soft" onClick={addRate}>
                + Add rate
              </Button>
            </div>
            {rates.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-4 py-6 text-center text-sm text-ink-500">
                No rates yet. Add one for each distinct rate (e.g. &quot;Weekday teaching&quot;,
                &quot;Grade 10&quot;, &quot;Paper marking&quot;).
              </p>
            )}
            <div className="space-y-3">
              {rates.map((r) => (
                <div
                  key={r.key}
                  className="grid gap-3 rounded-xl border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-2">
                    <Label>Task</Label>
                    <Select
                      value={r.task ?? ""}
                      onChange={(e) =>
                        patchRate(r.key, {
                          task: (e.target.value || null) as TaskType | null,
                        })
                      }
                    >
                      <option value="">Any</option>
                      {TASKS.filter((t) => t !== "fixed_salary").map((t) => (
                        <option key={t} value={t}>
                          {TASK_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-4">
                    <Label required>Descriptor</Label>
                    <Input
                      value={r.descriptor}
                      onChange={(e) => patchRate(r.key, { descriptor: e.target.value })}
                      placeholder="Weekday teaching"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label>Unit</Label>
                    <Select
                      value={r.unit}
                      onChange={(e) =>
                        patchRate(r.key, { unit: e.target.value as RateUnit })
                      }
                    >
                      {RATE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {RATE_UNIT_LABELS[u]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.amount}
                      onChange={(e) =>
                        patchRate(r.key, { amount: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeRate(r.key)}
                      className="h-10 w-full rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {mode === "create" && (
        <Card>
          <CardHeader
            title="Login & onboarding"
            description="How this team member first gets into their account."
          />
          <CardBody className="space-y-4">
            {email.trim().includes("@") ? (
              <label className="flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={sendWelcomeEmail}
                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span>
                  <span className="font-medium text-ink-800">
                    Email them a link to set their own password
                  </span>
                  <span className="mt-0.5 block text-ink-500">
                    Recommended — no need to share a password manually. They&apos;ll
                    log in with their employee ID afterwards.
                  </span>
                </span>
              </label>
            ) : (
              <p className="rounded-xl border border-ink-200 bg-ink-50/40 px-3 py-2.5 text-sm text-ink-600">
                No email — they&apos;ll log in with their employee ID. Set an initial
                password below and share it securely.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={
                  email.trim().includes("@") && sendWelcomeEmail
                    ? "Initial password (optional)"
                    : "Initial password"
                }
                className="flex-1"
                hint={
                  email.trim().includes("@") && sendWelcomeEmail
                    ? "Leave blank to auto-generate — they set their own via the email."
                    : "Share this with them securely (e.g. via WhatsApp)."
                }
              >
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={sendWelcomeEmail ? "Auto-generated if blank" : "At least 8 characters"}
                />
              </Field>
              <Button
                type="button"
                variant="neutral"
                onClick={() => setPassword(randomPassword())}
              >
                Generate
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          {mode === "create" ? "Create team member" : "Save changes"}
        </Button>
        <Button href="/hr/team-members" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
