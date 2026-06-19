-- ============================================================
-- Account deletion FK hardening + personal answer bank
-- ============================================================

alter table public.webhooks
  drop constraint if exists "webhooks_userId_fkey";

alter table public.webhooks
  add constraint "webhooks_userId_fkey"
  foreign key ("userId") references auth.users(id) on delete cascade;

alter table public.projects
  drop constraint if exists "projects_createdBy_fkey";

alter table public.projects
  alter column "createdBy" drop not null;

alter table public.projects
  add constraint "projects_createdBy_fkey"
  foreign key ("createdBy") references auth.users(id) on delete set null;

alter table public.interviews
  drop constraint if exists "interviews_userId_fkey";

alter table public.interviews
  add constraint "interviews_userId_fkey"
  foreign key ("userId") references auth.users(id) on delete cascade;

create table if not exists prep_answer_bank (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  "interviewId" uuid references interviews(id) on delete set null,
  "questionId" uuid references questions(id) on delete set null,
  "attemptId" uuid references prep_attempts(id) on delete set null,
  "interviewTitle" text not null default '',
  "questionText" text not null,
  "questionType" text,
  "answerText" text not null,
  score numeric,
  feedback jsonb not null default '{}'::jsonb,
  "audioPath" text,
  note text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_prep_answer_bank_user
  on prep_answer_bank ("userId", "createdAt" desc);
create unique index if not exists idx_prep_answer_bank_user_attempt
  on prep_answer_bank ("userId", "attemptId")
  where "attemptId" is not null;

drop trigger if exists set_prep_answer_bank_updated_at on prep_answer_bank;
create trigger set_prep_answer_bank_updated_at before update on prep_answer_bank
  for each row execute function update_updated_at();

alter table prep_answer_bank enable row level security;

drop policy if exists "Users manage own answer bank" on prep_answer_bank;
create policy "Users manage own answer bank"
  on prep_answer_bank for all
  using ("userId" = auth.uid())
  with check ("userId" = auth.uid());
