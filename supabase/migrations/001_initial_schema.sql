-- ============================================================
-- Aural — Squashed Initial Schema
--
-- Single migration combining all DDL for a fresh install.
-- Uses camelCase column names to match the TypeScript codebase.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE "UserRole"       AS ENUM ('USER', 'ADMIN', 'ENTERPRISE');
CREATE TYPE "MemberRole"     AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "InterviewMode"  AS ENUM ('CHAT', 'VOICE', 'HYBRID');
CREATE TYPE "ToneLevel"      AS ENUM ('CASUAL', 'PROFESSIONAL', 'FORMAL', 'FRIENDLY');
CREATE TYPE "FollowUpDepth"  AS ENUM ('LIGHT', 'MODERATE', 'DEEP');
CREATE TYPE "QuestionType"   AS ENUM ('OPEN_ENDED', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'CODING', 'WHITEBOARD', 'RESEARCH');
CREATE TYPE "SessionStatus"  AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
CREATE TYPE "MessageRole"    AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "ContentType"    AS ENUM ('TEXT', 'AUDIO', 'FILE', 'IMAGE', 'WHITEBOARD', 'CODE');


-- ────────────────────────────────────────────────────────────
-- HELPER: auto-update "updatedAt"
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────
-- PROFILES
-- ────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  name        text,
  avatar      text,
  organization text,
  role        "UserRole" NOT NULL DEFAULT 'USER',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- ORGANIZATIONS  (renamed from "workspaces" in earlier schema)
-- ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  "ownerId"   uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE organization_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "userId"      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("workspaceId", "userId")
);

CREATE INDEX idx_organization_members_user ON organization_members ("userId");


-- ────────────────────────────────────────────────────────────
-- PROJECTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  "createdBy"      uuid NOT NULL REFERENCES auth.users(id),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_organization ON projects ("organizationId");
CREATE INDEX idx_projects_created_by   ON projects ("createdBy");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE project_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId"  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "userId"     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("projectId", "userId")
);

CREATE INDEX idx_project_members_project ON project_members ("projectId");
CREATE INDEX idx_project_members_user    ON project_members ("userId");


-- ────────────────────────────────────────────────────────────
-- INTERVIEWS
-- ────────────────────────────────────────────────────────────

CREATE TABLE interviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  description           text,
  objective             text,
  "assessmentCriteria"  jsonb,
  mode                  "InterviewMode" NOT NULL DEFAULT 'CHAT',
  "allowModeSwitch"     boolean NOT NULL DEFAULT true,
  "userId"              uuid NOT NULL REFERENCES auth.users(id),
  "projectId"           uuid REFERENCES projects(id) ON DELETE SET NULL,
  "aiPersona"           text,
  "aiName"              text NOT NULL DEFAULT 'Aural',
  "aiTone"              "ToneLevel" NOT NULL DEFAULT 'PROFESSIONAL',
  "followUpDepth"       "FollowUpDepth" NOT NULL DEFAULT 'MODERATE',
  language              text NOT NULL DEFAULT 'en',
  "llmProvider"         text,
  "llmModel"            text,
  "isActive"            boolean NOT NULL DEFAULT true,
  "timeLimitMinutes"    int,
  "customBranding"      jsonb,
  "publicSlug"          text UNIQUE,
  "requireInvite"       boolean NOT NULL DEFAULT false,
  "invitedEmails"       text[] NOT NULL DEFAULT '{}',
  "videoMode"           boolean NOT NULL DEFAULT false,
  "chatEnabled"         boolean NOT NULL DEFAULT true,
  "voiceEnabled"        boolean NOT NULL DEFAULT false,
  "videoEnabled"        boolean NOT NULL DEFAULT false,
  "antiCheatingEnabled" boolean NOT NULL DEFAULT false,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_user         ON interviews ("userId");
CREATE INDEX idx_interviews_organization ON interviews ("projectId");
CREATE INDEX idx_interviews_project      ON interviews ("projectId");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- QUESTIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId"     uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "order"           int NOT NULL,
  "text"            text NOT NULL,
  description       text,
  "type"            "QuestionType" NOT NULL,
  options           jsonb,
  "starterCode"     jsonb,
  "validationRules" jsonb,
  "followUpPrompts" jsonb,
  "probeOnShort"    boolean NOT NULL DEFAULT true,
  "probeThreshold"  int,
  "showIf"          jsonb,
  "skipIf"          jsonb,
  "timeLimitSeconds" int,
  "isRequired"      boolean NOT NULL DEFAULT true,
  "allowFileUpload" boolean NOT NULL DEFAULT false,
  "allowedFileTypes" text[] NOT NULL DEFAULT '{}',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_interview ON questions ("interviewId");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- SESSIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId"           uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "participantEmail"      text,
  "participantName"       text,
  "participantPhone"      text,
  "participantMetadata"   jsonb,
  status                  "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "currentQuestionId"     uuid,
  "modeUsed"              "InterviewMode" NOT NULL DEFAULT 'CHAT',
  "modeSwitches"          int NOT NULL DEFAULT 0,
  summary                 text,
  insights                jsonb,
  themes                  text[] NOT NULL DEFAULT '{}',
  sentiment               jsonb,
  "startedAt"             timestamptz NOT NULL DEFAULT now(),
  "completedAt"           timestamptz,
  "lastActivityAt"        timestamptz NOT NULL DEFAULT now(),
  "totalDurationSeconds"  int,
  "audioRecordingUrl"     text,
  "screenshots"           jsonb,
  "audioDuration"         real,
  "antiCheatingLog"       jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_interview ON sessions ("interviewId");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- CANDIDATES
-- ────────────────────────────────────────────────────────────

CREATE TABLE candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId"    uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  phone            text,
  gender           text,
  birthday         text,
  notes            text,
  education        text,
  school           text,
  major            text,
  "graduationYear" int,
  "workExperience" text,
  "inviteToken"    text UNIQUE,
  "sessionId"      uuid REFERENCES sessions(id) ON DELETE SET NULL,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_interview_id  ON candidates ("interviewId");
CREATE INDEX idx_candidates_invite_token  ON candidates ("inviteToken") WHERE "inviteToken" IS NOT NULL;
CREATE INDEX idx_candidates_session_id    ON candidates ("sessionId");


-- ────────────────────────────────────────────────────────────
-- MESSAGES
-- ────────────────────────────────────────────────────────────

CREATE TABLE messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId"           uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role                  "MessageRole" NOT NULL,
  content               text NOT NULL,
  "contentType"         "ContentType" NOT NULL DEFAULT 'TEXT',
  "audioUrl"            text,
  "audioDurationSeconds" int,
  transcription         text,
  "whiteboardData"      jsonb,
  "whiteboardImageUrl"  text,
  "whiteboardPages"     int NOT NULL DEFAULT 1,
  "questionId"          uuid,
  "isFollowUp"          boolean NOT NULL DEFAULT false,
  "parentMessageId"     uuid,
  sentiment             text,
  "wordCount"           int,
  "readingTimeSeconds"  int,
  "timestamp"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages ("sessionId");


-- ────────────────────────────────────────────────────────────
-- API KEYS
-- ────────────────────────────────────────────────────────────

CREATE TABLE api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  key         text UNIQUE NOT NULL,
  "lastUsedAt" timestamptz,
  "expiresAt" timestamptz,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys ("userId");


-- ────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"       uuid,
  action         text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId"   text,
  metadata       jsonb,
  "ipAddress"    text,
  "userAgent"    text,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs ("userId");


-- ────────────────────────────────────────────────────────────
-- WEBHOOKS
-- ────────────────────────────────────────────────────────────

CREATE TABLE webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    uuid NOT NULL REFERENCES auth.users(id),
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  secret      text,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_user ON webhooks ("userId");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- SUPPORT TICKETS
-- ────────────────────────────────────────────────────────────

CREATE TABLE support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  type        text NOT NULL DEFAULT 'Question',
  severity    text,
  topic       text,
  message     text NOT NULL,
  attachments jsonb DEFAULT '[]',
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets      ENABLE ROW LEVEL SECURITY;


-- ── PROFILES ────────────────────────────────────────────────

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));


-- ── ORGANIZATIONS ───────────────────────────────────────────

CREATE POLICY "Org readable by member or owner"
  ON organizations FOR SELECT
  USING (
    "ownerId" = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = organizations.id
        AND organization_members."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners can insert organizations"
  ON organizations FOR INSERT
  WITH CHECK ("ownerId" = (SELECT auth.uid()));

CREATE POLICY "Owners can update organizations"
  ON organizations FOR UPDATE
  USING ("ownerId" = (SELECT auth.uid()))
  WITH CHECK ("ownerId" = (SELECT auth.uid()));

CREATE POLICY "Owners can delete organizations"
  ON organizations FOR DELETE
  USING ("ownerId" = (SELECT auth.uid()));


-- ── ORGANIZATION MEMBERS ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE "workspaceId" = org_id
      AND "userId" = auth.uid()
  );
$func$;

CREATE POLICY "Members can read org members"
  ON organization_members FOR SELECT
  USING (
    "userId" = (SELECT auth.uid())
    OR public.is_org_member("workspaceId")
  );

CREATE POLICY "Org owners can insert members"
  ON organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members."workspaceId"
        AND organizations."ownerId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org owners can update members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members."workspaceId"
        AND organizations."ownerId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org owners can delete members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members."workspaceId"
        AND organizations."ownerId" = (SELECT auth.uid())
    )
  );


-- ── PROJECTS ────────────────────────────────────────────────

CREATE POLICY "Projects readable by org member or admin"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org admins can insert projects"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('OWNER', 'ADMIN')
    )
  );

CREATE POLICY "Org admins can update projects"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('OWNER', 'ADMIN')
    )
  );

CREATE POLICY "Org admins can delete projects"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members."workspaceId" = projects."organizationId"
        AND organization_members."userId" = (SELECT auth.uid())
        AND organization_members.role IN ('OWNER', 'ADMIN')
    )
  );


-- ── PROJECT MEMBERS ─────────────────────────────────────────

CREATE POLICY "Org members can read project members"
  ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om."workspaceId" = p."organizationId"
      WHERE p.id = project_members."projectId"
        AND om."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org admins can manage project members"
  ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om."workspaceId" = p."organizationId"
      WHERE p.id = project_members."projectId"
        AND om."userId" = (SELECT auth.uid())
        AND om.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN organization_members om ON om."workspaceId" = p."organizationId"
      WHERE p.id = project_members."projectId"
        AND om."userId" = (SELECT auth.uid())
        AND om.role IN ('OWNER', 'ADMIN')
    )
  );


-- ── INTERVIEWS ──────────────────────────────────────────────

CREATE POLICY "Interviews readable by owner or public"
  ON interviews FOR SELECT
  USING (
    "userId" = (SELECT auth.uid())
    OR ("publicSlug" IS NOT NULL AND "isActive" = true)
  );

CREATE POLICY "Owners can insert own interviews"
  ON interviews FOR INSERT
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Owners can update own interviews"
  ON interviews FOR UPDATE
  USING ("userId" = (SELECT auth.uid()))
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Owners can delete own interviews"
  ON interviews FOR DELETE
  USING ("userId" = (SELECT auth.uid()));


-- ── QUESTIONS ───────────────────────────────────────────────

CREATE POLICY "Questions readable by owner or public interview"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = questions."interviewId"
        AND (
          interviews."userId" = (SELECT auth.uid())
          OR (interviews."publicSlug" IS NOT NULL AND interviews."isActive" = true)
        )
    )
  );

CREATE POLICY "Interview owners can insert questions"
  ON questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = questions."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can update questions"
  ON questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = questions."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = questions."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can delete questions"
  ON questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = questions."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );


-- ── SESSIONS ────────────────────────────────────────────────

CREATE POLICY "Interview owners can read sessions"
  ON sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = sessions."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Anyone can create sessions for public interviews"
  ON sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = sessions."interviewId"
        AND interviews."publicSlug" IS NOT NULL
        AND interviews."isActive" = true
    )
  );

CREATE POLICY "Session participants can update own session"
  ON sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);


-- ── MESSAGES ────────────────────────────────────────────────

CREATE POLICY "Interview owners can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN interviews ON interviews.id = sessions."interviewId"
      WHERE sessions.id = messages."sessionId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Anyone can insert messages into active sessions"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = messages."sessionId"
        AND sessions.status = 'IN_PROGRESS'
    )
  );


-- ── CANDIDATES ──────────────────────────────────────────────

CREATE POLICY "Candidates readable by owner or invite token"
  ON candidates FOR SELECT
  USING (
    "inviteToken" IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = candidates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can insert candidates"
  ON candidates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = candidates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can update candidates"
  ON candidates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = candidates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = candidates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );

CREATE POLICY "Interview owners can delete candidates"
  ON candidates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM interviews
      WHERE interviews.id = candidates."interviewId"
        AND interviews."userId" = (SELECT auth.uid())
    )
  );


-- ── API KEYS ────────────────────────────────────────────────

CREATE POLICY "Users can read own API keys"
  ON api_keys FOR SELECT
  USING ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can insert own API keys"
  ON api_keys FOR INSERT
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  USING ("userId" = (SELECT auth.uid()))
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING ("userId" = (SELECT auth.uid()));


-- ── AUDIT LOGS ──────────────────────────────────────────────

CREATE POLICY "Users can read own audit logs"
  ON audit_logs FOR SELECT
  USING ("userId" = (SELECT auth.uid()));


-- ── WEBHOOKS ────────────────────────────────────────────────

CREATE POLICY "Users can read own webhooks"
  ON webhooks FOR SELECT
  USING ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can insert own webhooks"
  ON webhooks FOR INSERT
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can update own webhooks"
  ON webhooks FOR UPDATE
  USING ("userId" = (SELECT auth.uid()))
  WITH CHECK ("userId" = (SELECT auth.uid()));

CREATE POLICY "Users can delete own webhooks"
  ON webhooks FOR DELETE
  USING ("userId" = (SELECT auth.uid()));


-- ── SUPPORT TICKETS ─────────────────────────────────────────

CREATE POLICY "Users can create their own tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- STORAGE BUCKETS & POLICIES
-- ════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES
  ('whiteboards',          'whiteboards',          false),
  ('recordings',           'recordings',           false),
  ('screenshots',          'screenshots',          false),
  ('support-attachments',  'support-attachments',  false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload whiteboards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whiteboards');

CREATE POLICY "Authenticated users can read whiteboards"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whiteboards');

CREATE POLICY "Authenticated users can upload recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings');

CREATE POLICY "Authenticated users can read recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings');

CREATE POLICY "Authenticated users can upload screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'screenshots');

CREATE POLICY "Authenticated users can read screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'screenshots');

CREATE POLICY "Users can upload support attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own support attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ════════════════════════════════════════════════════════════
-- SECURITY DEFINER FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- Auto-create profile + personal org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id  uuid;
  proj_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    name   = coalesce(excluded.name, profiles.name),
    avatar = coalesce(excluded.avatar, profiles.avatar);

  org_id  := gen_random_uuid();
  proj_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, slug, "ownerId")
  VALUES (org_id, 'Personal', 'personal-' || NEW.id::text, NEW.id)
  ON CONFLICT (slug) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.organization_members ("workspaceId", "userId", role)
    VALUES (org_id, NEW.id, 'OWNER');

    INSERT INTO public.projects (id, "organizationId", name, "createdBy")
    VALUES (proj_id, org_id, 'Default', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Create a session for a public interview
CREATE OR REPLACE FUNCTION create_interview_session(
  p_interview_id       uuid,
  p_participant_name   text DEFAULT NULL,
  p_participant_email  text DEFAULT NULL,
  p_mode_used          "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interviews
    WHERE id = p_interview_id
      AND "publicSlug" IS NOT NULL
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Interview not found or inactive';
  END IF;

  INSERT INTO sessions ("interviewId", "participantName", "participantEmail", "modeUsed", "currentQuestionId")
  VALUES (p_interview_id, p_participant_name, p_participant_email, p_mode_used, p_current_question_id)
  RETURNING * INTO v_session;

  RETURN row_to_json(v_session);
END;
$$;


-- Create a session from an invite token
CREATE OR REPLACE FUNCTION create_invite_session(
  p_invite_token        text,
  p_mode_used           "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate candidates;
  v_interview interviews;
  v_session   sessions;
BEGIN
  SELECT * INTO v_candidate FROM candidates WHERE "inviteToken" = p_invite_token;
  IF v_candidate IS NULL THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  IF v_candidate."sessionId" IS NOT NULL THEN
    SELECT * INTO v_session FROM sessions WHERE id = v_candidate."sessionId";
    RETURN row_to_json(v_session);
  END IF;

  SELECT * INTO v_interview FROM interviews WHERE id = v_candidate."interviewId";
  IF v_interview IS NULL THEN
    RAISE EXCEPTION 'Interview not found';
  END IF;

  INSERT INTO sessions ("interviewId", "participantName", "participantEmail", "modeUsed", "currentQuestionId")
  VALUES (v_interview.id, v_candidate.name, v_candidate.email, coalesce(p_mode_used, v_interview.mode), p_current_question_id)
  RETURNING * INTO v_session;

  UPDATE candidates SET "sessionId" = v_session.id, "updatedAt" = now() WHERE id = v_candidate.id;

  RETURN row_to_json(v_session);
END;
$$;


-- Create organization atomically (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.create_organization(
  org_name text,
  org_slug text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id uuid;
  v_org     record;
  v_proj    record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (name, slug, "ownerId")
  VALUES (org_name, org_slug, v_user_id)
  RETURNING * INTO v_org;

  INSERT INTO organization_members ("workspaceId", "userId", role)
  VALUES (v_org.id, v_user_id, 'OWNER');

  INSERT INTO projects ("organizationId", name, "createdBy")
  VALUES (v_org.id, 'Default', v_user_id)
  RETURNING * INTO v_proj;

  RETURN json_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'ownerId', v_org."ownerId"
  );
END;
$func$;
