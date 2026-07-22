# Global Online Invoicing App

A one-stop invoicing app for the **MathVision / StudyHub** Global Online tutoring
team. Team members track their sessions and hours and submit a clean, consistent
invoice each month; HR reviews, approves, locks and exports payroll; department
heads submit session/hour cross-checks so HR can verify submissions.

Built with **Next.js (App Router) + TypeScript + Tailwind**, **Supabase**
(Postgres, Auth, Row-Level Security), and deployed on **Vercel**.

---

## Features

### HR
- Set up and edit team members (details auto-populate their invoices).
- Configure per-member **rates** (a descriptor dropdown) and/or a **fixed salary**.
- **Dashboard** showing every team member's invoice status for a month
  (not started · draft · submitted · approved · locked · paid).
- Open a month for invoicing; **broadcast** a message to all team members.
- Review invoices with a **department-head cross-check comparison**
  (invoice sessions/hours vs. reported), then approve → lock → mark paid.
- **Payroll report** per month with per-currency totals and **CSV export**.
- Manage the MathVision company address and department-head accounts.

### Team Member
- See which months are open and start/continue an invoice.
- Line items: **Centre × Task × Rate**, sessions, hours, notes — totals update live.
- A **tax %** line before the total.
- Choose the name shown on the invoice (HR's name or a custom one) and the
  ship-to address.
- Save drafts, submit, edit until HR locks it, and **download/print** any invoice.

### Department Head
- Record the sessions/hours a teacher actually worked for a month, per business,
  as a cross-check for HR.

---

## Invoice calculation

Each rate carries a **unit** — `per session`, `per hour`, or `fixed` — so line
totals reconcile the spec cleanly:

| Rate unit    | Line total          |
|--------------|---------------------|
| per session  | `sessions × rate`   |
| per hour     | `hours × rate`      |
| fixed salary | the fixed amount    |

Invoice total: `subtotal` → `tax (rate %)` → `total`. Line totals, subtotals and
tax are recomputed by database triggers, so a client can never post a tampered
total.

Invoice numbers are generated as `INV-[employee ID]-[YYYY]-[MM]`.

---

## Prerequisites

- Node.js ≥ 18.18
- A free [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment)

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project & get keys

In the Supabase dashboard → **Project Settings → API**, copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, keep secret)

Copy `.env.example` to `.env.local` and fill these in:

```bash
cp .env.example .env.local
```

### 3. Apply the database schema

Run the migrations in `supabase/migrations/` **in order** (0001 → 0004).

**Option A — Supabase SQL Editor (simplest):** open each file and paste/run it
in the dashboard's SQL editor, in order.

**Option B — Supabase CLI:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

The migrations create the schema (`0001`), functions & integrity triggers
(`0002`), Row-Level Security policies (`0003`), and the atomic invoice-save RPC
(`0004`).

### 4. Seed demo data (optional but recommended)

```bash
npm run db:seed
```

This creates demo logins and realistic data across every invoice status:

| Role            | Email                    | Password       |
|-----------------|--------------------------|----------------|
| HR              | `hr@mathvision.demo`     | `Password123!` |
| Team Member     | `teacher@mathvision.demo`| `Password123!` |
| Department Head | `head@mathvision.demo`   | `Password123!` |

(Change these via `SEED_*` variables in `.env.local`. Two extra teachers,
`teacher2@` and `teacher3@`, are also created.)

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000 and sign in with a demo account.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Import** the repo (framework auto-detected as Next.js).
3. Add **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — required at runtime so HR can create
     team-member / department-head login accounts.
4. **Deploy.**
5. In Supabase → **Authentication → URL Configuration**, set the **Site URL** to
   your Vercel domain. No email provider setup is needed: accounts are created by
   HR with `email_confirm`, and login is email + password.

That's it — the app is live.

---

## Going to production (removing demo data)

Create your own HR account and wipe the demo data:

```bash
npm run db:wipe        # removes all data + demo users (asks for confirmation)
```

Then bootstrap your first HR user (there is no public sign-up):

1. Supabase → **Authentication → Users → Add user** (email + password, auto-confirm).
2. Supabase → **SQL Editor**:

   ```sql
   update public.profiles set role = 'hr' where email = 'you@yourcompany.com';
   ```

Sign in as that HR user and set up your real team from **Team Members**.

---

## How it works

**Roles & routing** — after login users land on `/hr`, `/team`, or `/dept` based
on their profile role. Each area's layout enforces the role; the database's RLS
is the real security boundary.

**Invoice lifecycle**

```
draft ──submit──▶ submitted ──approve──▶ approved ──lock──▶ locked ──mark paid──▶ paid
   ▲                  │                      │                 │
   └──request changes─┘   (team member edits an approved invoice → back to submitted)
```

A team member can edit while `draft`, `submitted`, or `approved`. Once HR
**locks** it, it can no longer be edited (enforced by RLS + triggers).

---

## Environment variables

| Variable                        | Where    | Purpose                                        |
|---------------------------------|----------|------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server | Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Public anon key                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | server   | Admin ops (creating login accounts), seed/wipe |
| `SEED_*`                        | scripts  | Demo account credentials for `db:seed`         |

---

## Scripts

| Command            | Description                          |
|--------------------|--------------------------------------|
| `npm run dev`      | Start the dev server                 |
| `npm run build`    | Production build                     |
| `npm run start`    | Run the production build             |
| `npm run typecheck`| TypeScript check                     |
| `npm run db:seed`  | Seed demo accounts + data            |
| `npm run db:wipe`  | Remove all data + demo users         |

---

## Project structure

```
src/
  app/
    login/                  Sign in
    hr/                     HR area (dashboard, team members, invoices, periods,
                            messages, reports, settings)
    team/                   Team member area (overview, invoices, profile)
    dept/                   Department head area (overview, cross-checks)
    print/invoice/[id]/     Printable / downloadable invoice
  actions/                  Server actions (invoices, team members, periods, …)
  components/               UI kit + feature components
  lib/                      Domain constants, types, invoice math, auth, Supabase
supabase/migrations/        SQL schema, functions, RLS, RPC
scripts/                    seed.mjs, wipe.mjs
```

## Design

The **MathVision** palette (deep academic blue + warm gold + teal) lives in
`tailwind.config.ts` — edit the color scales there to rebrand the whole app in
one place.
