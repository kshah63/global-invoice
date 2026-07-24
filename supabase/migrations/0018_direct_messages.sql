-- =====================================================================
-- Migration 0018: direct (1:1) messaging between HR and a person
-- A running thread per person (any login: individual, supplier leader,
-- roster member, department head). Either side can post. Separate from the
-- existing broadcast `messages` table. Unread is tracked with per-side
-- last-read timestamps + a denormalised "last message" summary.
-- =====================================================================

create table if not exists public.conversations (
  id                       uuid primary key default gen_random_uuid(),
  participant_id           uuid not null unique references public.profiles (id) on delete cascade,
  last_message_at          timestamptz not null default now(),
  last_message_from_hr     boolean not null default false,
  last_message_preview     text,
  hr_last_read_at          timestamptz,
  participant_last_read_at timestamptz,
  created_at               timestamptz not null default now()
);
create index if not exists conversations_recent_idx
  on public.conversations (last_message_at desc);

create table if not exists public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  from_hr         boolean not null default false,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists direct_messages_thread_idx
  on public.direct_messages (conversation_id, created_at);

-- Sender identity + side are authoritative on the server (a client can't spoof
-- who a message is from). Service role (auth.uid() null) keeps provided values.
create or replace function public.enforce_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.sender_id := auth.uid();
    new.from_hr := public.is_hr();
  end if;
  return new;
end;
$$;

drop trigger if exists direct_messages_enforce on public.direct_messages;
create trigger direct_messages_enforce
  before insert on public.direct_messages
  for each row execute function public.enforce_direct_message();

-- Roll the latest message up onto the conversation for list + unread display.
create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set
    last_message_at      = new.created_at,
    last_message_from_hr = new.from_hr,
    last_message_preview  = left(new.body, 140)
  where id = new.conversation_id;
  return null;
end;
$$;

drop trigger if exists direct_messages_bump on public.direct_messages;
create trigger direct_messages_bump
  after insert on public.direct_messages
  for each row execute function public.bump_conversation();

-- --- access helper + RLS --------------------------------------------

create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = cid and (public.is_hr() or c.participant_id = auth.uid())
  );
$$;

alter table public.conversations enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_hr() or participant_id = auth.uid());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (public.is_hr() or participant_id = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (public.is_hr() or participant_id = auth.uid())
  with check (public.is_hr() or participant_id = auth.uid());

alter table public.direct_messages enable row level security;

drop policy if exists direct_messages_select on public.direct_messages;
create policy direct_messages_select on public.direct_messages
  for select using (public.can_access_conversation(conversation_id));

drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert with check (public.can_access_conversation(conversation_id));
