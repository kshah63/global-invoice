"use client";

import { useState } from "react";
import { updateInvoicePrefs } from "@/actions/team";
import { Field, Input, Label, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ProfilePrefsForm({
  hrName,
  useHrName,
  invoiceDisplayName,
  shipToAddress,
}: {
  hrName: string;
  useHrName: boolean;
  invoiceDisplayName: string;
  shipToAddress: string;
}) {
  const [useHr, setUseHr] = useState(useHrName);

  return (
    <form action={updateInvoicePrefs} className="space-y-5">
      <input type="hidden" name="use_hr_name" value={String(useHr)} />

      <div>
        <Label>Name shown on your invoices</Label>
        <div className="mt-1 space-y-2">
          <label className="flex items-center gap-2.5 rounded-xl border border-ink-200 px-3 py-2.5 text-sm">
            <input
              type="radio"
              name="name_choice"
              checked={useHr}
              onChange={() => setUseHr(true)}
              className="h-4 w-4 accent-brand-600"
            />
            <span>
              Use the name from HR — <span className="font-medium">{hrName}</span>
            </span>
          </label>
          <label className="flex items-center gap-2.5 rounded-xl border border-ink-200 px-3 py-2.5 text-sm">
            <input
              type="radio"
              name="name_choice"
              checked={!useHr}
              onChange={() => setUseHr(false)}
              className="h-4 w-4 accent-brand-600"
            />
            <span>Use a different name</span>
          </label>
        </div>
      </div>

      <Field
        label="Custom invoice name"
        htmlFor="invoice_display_name"
        hint="Only used when 'Use a different name' is selected."
      >
        <Input
          id="invoice_display_name"
          name="invoice_display_name"
          defaultValue={invoiceDisplayName}
          disabled={useHr}
          placeholder="e.g. Your preferred name"
        />
      </Field>

      <Field
        label="Ship-to address"
        htmlFor="ship_to_address"
        hint="This appears on every invoice you create."
      >
        <Textarea
          id="ship_to_address"
          name="ship_to_address"
          defaultValue={shipToAddress}
          placeholder="Address to show on your invoices"
        />
      </Field>

      <SubmitButton>Save preferences</SubmitButton>
    </form>
  );
}
