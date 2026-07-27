"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  CURRENCY_META,
  type Currency,
} from "@/lib/constants";
import {
  createSupplier,
  updateSupplier,
  type SupplierInput,
} from "@/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function SupplierDetailsForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: Partial<SupplierInput>;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [supplierCode, setSupplierCode] = useState(initial?.supplier_code ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "SGD");
  const [shipTo, setShipTo] = useState(initial?.ship_to_address ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initial?.payment_details ?? "");
  const [password, setPassword] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function buildInput(): SupplierInput {
    return {
      name: name.trim(),
      email: email.trim(),
      supplier_code: supplierCode.trim(),
      currency,
      ship_to_address: shipTo.trim() || null,
      payment_details: paymentDetails.trim() || null,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!supplierCode.trim()) {
      setError("A supplier code is required (used in the invoice number).");
      return;
    }
    if (mode === "create" && !sendWelcomeEmail && password.length < 8) {
      setError("Set an initial password of at least 8 characters, or enable the welcome email.");
      return;
    }
    setSaving(true);
    const input = buildInput();

    if (mode === "create") {
      const res = await createSupplier({ ...input, password, sendWelcomeEmail });
      if (res?.error) {
        setError(res.error);
        setSaving(false);
      }
      return;
    }

    const res = await updateSupplier(id!, input);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setNotice("Details saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card>
        <CardHeader title="Supplier details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Contact email" required hint="The leader's login + password resets.">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Supplier code"
            required
            hint="Appears in the invoice number (e.g. INV-ABCTUT-2026-07). The leader can also sign in with it."
          >
            <Input
              value={supplierCode}
              onChange={(e) => setSupplierCode(e.target.value.toUpperCase())}
              placeholder="ABCTUT"
            />
          </Field>
          <Field label="Currency" required>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_META[c].label} ({c})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="From address"
            className="sm:col-span-2"
            hint="Shown under “From” on the consolidated invoice. Pulls into the supplier's invoices automatically; the leader can override per invoice."
          >
            <Textarea
              value={shipTo}
              onChange={(e) => setShipTo(e.target.value)}
              placeholder="The supplier's billing address"
            />
          </Field>
          <Field label="Payment details" className="sm:col-span-2">
            <Textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder="Bank / transfer details for paying the supplier"
            />
          </Field>
        </CardBody>
      </Card>

      {mode === "create" && (
        <Card>
          <CardHeader title="Login & onboarding" description="How the supplier's leader first signs in." />
          <CardBody className="space-y-4">
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
                  Recommended. They sign in with the supplier code (or email) afterwards.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={sendWelcomeEmail ? "Initial password (optional)" : "Initial password"}
                className="flex-1"
                hint={sendWelcomeEmail ? "Leave blank to auto-generate." : "Share it securely."}
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
          {mode === "create" ? "Create supplier" : "Save details"}
        </Button>
        <Button href="/hr/team-members" variant="ghost">
          {mode === "create" ? "Cancel" : "Back to People"}
        </Button>
      </div>
    </form>
  );
}
