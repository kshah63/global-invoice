"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/Feedback";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setTeamMemberActive } from "@/actions/team-members";
import { deleteDepartmentHead } from "@/actions/settings";
import { formatCurrency } from "@/lib/format";
import type { Profile, TeamMember, TeamMemberRate } from "@/lib/types";

const RATE_UNIT_SHORT: Record<string, string> = {
  per_hour: "/hr",
  per_session: "/session",
  fixed: "",
};

export interface IndividualEntry {
  member: TeamMember;
  rates: TeamMemberRate[];
}
export interface SupplierEntry {
  member: TeamMember;
  rosterCount: number;
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Active</Badge>
  ) : (
    <Badge className="bg-ink-100 text-ink-600 ring-ink-200">Inactive</Badge>
  );
}

function PayCell({ member, rates }: { member: TeamMember; rates: TeamMemberRate[] }) {
  if (member.fixed_salary != null) {
    return <span>{formatCurrency(member.fixed_salary, member.currency)}</span>;
  }
  if (rates.length === 0) return <span className="text-ink-400">—</span>;
  const shown = rates.slice(0, 2);
  const extra = rates.length - shown.length;
  return (
    <span className="text-ink-700">
      {shown.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? ", " : ""}
          {formatCurrency(Number(r.amount), member.currency)}
          <span className="text-ink-400">{RATE_UNIT_SHORT[r.unit] ?? ""}</span>
        </span>
      ))}
      {extra > 0 && <span className="text-ink-400"> +{extra} more</span>}
    </span>
  );
}

function RowActions({ href, member }: { href: string; member: TeamMember }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={href}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
      >
        Edit
      </Link>
      <form action={setTeamMemberActive}>
        <input type="hidden" name="id" value={member.id} />
        <input type="hidden" name="active" value={String(!member.active)} />
        <SubmitButton variant="ghost" size="sm">
          {member.active ? "Deactivate" : "Activate"}
        </SubmitButton>
      </form>
    </div>
  );
}

type StatusFilter = "all" | "active" | "inactive";

function matches(q: string, ...fields: (string | null | undefined)[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

export function PeopleDirectory({
  individuals,
  suppliers,
  deptHeads,
}: {
  individuals: IndividualEntry[];
  suppliers: SupplierEntry[];
  deptHeads: Profile[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const passStatus = (active: boolean) =>
    status === "all" || (status === "active" ? active : !active);

  const filteredIndividuals = useMemo(
    () =>
      individuals.filter(
        (e) =>
          passStatus(e.member.active) &&
          matches(q, e.member.name, e.member.email, e.member.employee_id)
      ),
    [individuals, q, status]
  );
  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (e) =>
          passStatus(e.member.active) &&
          matches(q, e.member.name, e.member.email, e.member.supplier_code)
      ),
    [suppliers, q, status]
  );
  const filteredHeads = useMemo(
    () =>
      deptHeads.filter((h) => matches(q, h.full_name, h.email, h.login_code)),
    [deptHeads, q]
  );

  const clear = q || status !== "all";

  return (
    <>
      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
            🔍
          </span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ID, code or email"
            className="pl-9"
            aria-label="Search people"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="w-40"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
          {clear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setStatus("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Individuals */}
      <Card>
        <CardHeader
          title="Individuals"
          description={`${filteredIndividuals.length} of ${individuals.length}`}
        />
        <CardBody className="p-0">
          {filteredIndividuals.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No matching individuals"
                description={
                  individuals.length === 0
                    ? "Add your first individual contractor to begin."
                    : "Try a different search or status filter."
                }
                action={
                  individuals.length === 0 ? (
                    <Button href="/hr/team-members/new">Add individual</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">ID</th>
                    <th className="px-5 py-3 font-semibold">Currency</th>
                    <th className="px-5 py-3 font-semibold">Pay</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredIndividuals.map(({ member: m, rates }) => (
                    <tr key={m.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/hr/team-members/${m.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {m.name}
                        </Link>
                        <div className="text-xs text-ink-400">{m.email}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500 tnum">
                        {m.employee_id}
                      </td>
                      <td className="px-5 py-3">{m.currency}</td>
                      <td className="px-5 py-3 tnum">
                        <PayCell member={m} rates={rates} />
                      </td>
                      <td className="px-5 py-3">
                        <ActiveBadge active={m.active} />
                      </td>
                      <td className="px-5 py-3">
                        <RowActions href={`/hr/team-members/${m.id}`} member={m} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Suppliers */}
      <Card className="mt-8">
        <CardHeader
          title="Suppliers"
          description={`${filteredSuppliers.length} of ${suppliers.length} — a business that invoices for several people.`}
        />
        <CardBody className="p-0">
          {filteredSuppliers.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No matching suppliers"
                description={
                  suppliers.length === 0
                    ? "Use “Add supplier” at the top to add one."
                    : "Try a different search or status filter."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-5 py-3 font-semibold">Supplier</th>
                    <th className="px-5 py-3 font-semibold">Code</th>
                    <th className="px-5 py-3 font-semibold">Roster</th>
                    <th className="px-5 py-3 font-semibold">Currency</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredSuppliers.map(({ member: m, rosterCount }) => (
                    <tr key={m.id} className="hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/hr/suppliers/${m.id}`}
                          className="font-medium text-ink-900 hover:text-brand-700"
                        >
                          {m.name}
                        </Link>
                        <div className="text-xs text-ink-400">{m.email}</div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-500">
                        {m.supplier_code}
                      </td>
                      <td className="px-5 py-3 tnum text-ink-700">
                        {rosterCount}
                        <span className="ml-1 text-xs text-ink-400">
                          {rosterCount === 1 ? "person" : "people"}
                        </span>
                      </td>
                      <td className="px-5 py-3">{m.currency}</td>
                      <td className="px-5 py-3">
                        <ActiveBadge active={m.active} />
                      </td>
                      <td className="px-5 py-3">
                        <RowActions href={`/hr/suppliers/${m.id}`} member={m} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Department heads */}
      <Card className="mt-8">
        <CardHeader
          title="Department heads"
          description={`${filteredHeads.length} of ${deptHeads.length} — they submit cross-checks and sign in with their Login ID.`}
        />
        <CardBody className={filteredHeads.length === 0 ? undefined : "p-0"}>
          {filteredHeads.length === 0 ? (
            <EmptyState
              title="No matching department heads"
              description={
                deptHeads.length === 0
                  ? "Use “Add department head” at the top to add one."
                  : "Try a different search."
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {filteredHeads.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="font-medium text-ink-900">{h.full_name ?? h.email}</div>
                    <div className="text-xs text-ink-400">{h.email}</div>
                    {h.login_code && (
                      <div className="text-xs text-ink-400">Login ID: {h.login_code}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {h.business && (
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                        {h.business}
                      </Badge>
                    )}
                    <Link
                      href={`/hr/department-heads/${h.id}`}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                    >
                      Edit
                    </Link>
                    <form action={deleteDepartmentHead}>
                      <input type="hidden" name="profile_id" value={h.id} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        confirm={`Remove ${h.full_name ?? h.email}?`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
