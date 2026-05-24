-- ============================================================
-- Interview prep module
--
-- Practice sessions run against an interview's existing questions.
-- JD / resume / role context live on the interview row.
-- ============================================================

alter table interviews
  add column if not exists "jobDescription" text,
  add column if not exists "resumeText" text,
  add column if not exists "parsedResume" jsonb,
  add column if not exists "companyName" text,
  add column if not exists "roleTitle" text;

create table if not exists prep_sessions (
  id uuid primary key default gen_random_uuid(),
  "interviewId" uuid not null references interviews(id) on delete cascade,
  "userId" uuid not null references auth.users(id) on delete cascade,
  "organizationId" uuid references organizations(id) on delete set null,
  mode text not null default 'TEXT',
  status text not null default 'IN_PROGRESS',
  timed boolean not null default false,
  "durationLimitMinutes" int,
  "startedAt" timestamptz not null default now(),
  "lastActivityAt" timestamptz not null default now(),
  "completedAt" timestamptz,
  "totalDurationSeconds" int,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

alter table prep_sessions
  add column if not exists "organizationId" uuid references organizations(id) on delete set null,
  add column if not exists mode text not null default 'TEXT',
  add column if not exists status text not null default 'IN_PROGRESS',
  add column if not exists timed boolean not null default false,
  add column if not exists "durationLimitMinutes" int,
  add column if not exists "startedAt" timestamptz not null default now(),
  add column if not exists "lastActivityAt" timestamptz not null default now(),
  add column if not exists "completedAt" timestamptz,
  add column if not exists "totalDurationSeconds" int,
  add column if not exists "createdAt" timestamptz not null default now(),
  add column if not exists "updatedAt" timestamptz not null default now();

create table if not exists prep_attempts (
  id uuid primary key default gen_random_uuid(),
  "sessionId" uuid not null references prep_sessions(id) on delete cascade,
  "interviewId" uuid not null references interviews(id) on delete cascade,
  "questionId" uuid not null references questions(id) on delete cascade,
  "userId" uuid not null references auth.users(id) on delete cascade,
  "answerText" text not null,
  "inputMode" text not null default 'TEXT',
  "durationSeconds" int,
  feedback jsonb not null default '{}'::jsonb,
  "followUp" jsonb not null default '[]'::jsonb,
  score numeric,
  "attemptNumber" int not null default 1,
  "audioUrl" text,
  "audioDurationSeconds" real,
  "createdAt" timestamptz not null default now()
);

alter table prep_attempts
  add column if not exists "audioUrl" text,
  add column if not exists "audioDurationSeconds" real;

create index if not exists idx_prep_sessions_interview
  on prep_sessions ("interviewId", "createdAt" desc);
create index if not exists idx_prep_sessions_user
  on prep_sessions ("userId", "createdAt" desc);
create index if not exists idx_prep_sessions_org
  on prep_sessions ("organizationId", "createdAt" desc);
create index if not exists idx_prep_attempts_interview
  on prep_attempts ("interviewId", "createdAt" desc);
create index if not exists idx_prep_attempts_question
  on prep_attempts ("questionId", "attemptNumber");
create index if not exists idx_prep_attempts_session
  on prep_attempts ("sessionId", "createdAt");

drop trigger if exists set_prep_sessions_updated_at on prep_sessions;
create trigger set_prep_sessions_updated_at before update on prep_sessions
  for each row execute function update_updated_at();

alter table prep_sessions enable row level security;
alter table prep_attempts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'prep_sessions'
      and policyname = 'Users manage own prep sessions'
  ) then
    create policy "Users manage own prep sessions"
      on prep_sessions for all
      using ("userId" = auth.uid())
      with check ("userId" = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'prep_attempts'
      and policyname = 'Users manage own prep attempts'
  ) then
    create policy "Users manage own prep attempts"
      on prep_attempts for all
      using ("userId" = auth.uid())
      with check ("userId" = auth.uid());
  end if;
end
$$;
