-- TestArchive target schema (initial)
-- Source of truth for fields: doc/database-target.md
-- Apply with: supabase db push / psql -f ...

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email citext NOT NULL,
  username citext NOT NULL,
  display_name text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'student'
    CHECK (role IN ('admin', 'teacher', 'student')),
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'locked', 'disabled')),
  must_change_password boolean NOT NULL DEFAULT true,
  temporary_password_expires_at timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  math_exp integer NOT NULL DEFAULT 0 CHECK (math_exp >= 0),
  lang_exp integer NOT NULL DEFAULT 0 CHECK (lang_exp >= 0),
  flang_exp integer NOT NULL DEFAULT 0 CHECK (flang_exp >= 0),
  sci_exp integer NOT NULL DEFAULT 0 CHECK (sci_exp >= 0),
  hist_geo_exp integer NOT NULL DEFAULT 0 CHECK (hist_geo_exp >= 0),
  civic_exp integer NOT NULL DEFAULT 0 CHECK (civic_exp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_username_unique UNIQUE (username),
  CONSTRAINT users_username_format CHECK (
    username ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$'
  )
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON public.sessions (expires_at);

CREATE TABLE public.auth_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  type text NOT NULL CHECK (type IN ('invite', 'password_reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX auth_tokens_user_id_idx ON public.auth_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------

CREATE TABLE public.subjects (
  id text PRIMARY KEY,
  label text NOT NULL
);

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  name text NOT NULL,
  grade integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_subject_name_grade_unique UNIQUE (subject_id, name, grade)
);

CREATE INDEX topics_subject_id_idx ON public.topics (subject_id);

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  url text NOT NULL,
  public_id text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  uploaded_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX media_uploaded_by_idx ON public.media (uploaded_by);

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type text NOT NULL
    CHECK (type IN (
      'multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'essay',
      'multiple_select', 'matching', 'ordering', 'numeric'
    )),
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  difficulty text NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  points numeric(10, 2) NOT NULL DEFAULT 1 CHECK (points > 0),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'published', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER questions_set_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX questions_subject_grade_status_idx
  ON public.questions (subject_id, grade, status);
CREATE INDEX questions_created_by_idx ON public.questions (created_by);
CREATE INDEX questions_tags_gin_idx ON public.questions USING gin (tags);

CREATE TABLE public.question_options (
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE CASCADE,
  id text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  "order" integer NOT NULL DEFAULT 0,
  PRIMARY KEY (question_id, id)
);

CREATE TABLE public.question_topic_links (
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics (id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, topic_id)
);

CREATE TABLE public.question_banks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_banks_owner_name_unique UNIQUE (owner_id, name)
);

CREATE TRIGGER question_banks_set_updated_at
  BEFORE UPDATE ON public.question_banks
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.question_bank_items (
  bank_id uuid NOT NULL REFERENCES public.question_banks (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE CASCADE,
  PRIMARY KEY (bank_id, question_id)
);

CREATE TABLE public.question_stats (
  question_id uuid PRIMARY KEY REFERENCES public.questions (id) ON DELETE CASCADE,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  correct_rate numeric(6, 4),
  average_points_earned numeric(10, 2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Exams
-- ---------------------------------------------------------------------------

CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  type text NOT NULL DEFAULT 'practice'
    CHECK (type IN ('practice', 'quiz', 'homework', 'worksheet', 'midterm', 'final')),
  difficulty text NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration integer NOT NULL CHECK (duration >= 0),
  total_points numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  instructions text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{
    "shuffleQuestions": false,
    "shuffleOptions": true,
    "showResult": true,
    "showExplanation": true
  }'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER exams_set_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX exams_owner_status_idx ON public.exams (owner_id, status);
CREATE INDEX exams_subject_grade_idx ON public.exams (subject_id, grade);

CREATE TABLE public.exam_sections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  "order" integer NOT NULL DEFAULT 1,
  CONSTRAINT exam_sections_exam_order_unique UNIQUE (exam_id, "order")
);

CREATE TABLE public.exam_questions (
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.exam_sections (id) ON DELETE SET NULL,
  "order" integer NOT NULL DEFAULT 1,
  points numeric(10, 2) NOT NULL CHECK (points > 0),
  PRIMARY KEY (exam_id, question_id)
);

CREATE INDEX exam_questions_section_id_idx ON public.exam_questions (section_id);

-- ---------------------------------------------------------------------------
-- Distribution
-- ---------------------------------------------------------------------------

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classes_owner_name_unique UNIQUE (owner_id, name)
);

CREATE TABLE public.class_members (
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);

CREATE INDEX class_members_user_id_idx ON public.class_members (user_id);

CREATE TABLE public.exam_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
  target_type text NOT NULL DEFAULT 'user' CHECK (target_type = 'user'),
  target_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  source_class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  available_from timestamptz NOT NULL,
  deadline timestamptz NOT NULL,
  attempt_limit integer NOT NULL DEFAULT 1 CHECK (attempt_limit >= 1),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN (
      'assigned', 'available', 'in_progress', 'completed', 'expired', 'cancelled'
    )),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_assignments_window_check CHECK (available_from < deadline)
);

CREATE INDEX exam_assignments_target_id_idx ON public.exam_assignments (target_id);
CREATE INDEX exam_assignments_exam_id_idx ON public.exam_assignments (exam_id);
CREATE INDEX exam_assignments_source_class_id_idx ON public.exam_assignments (source_class_id);
CREATE UNIQUE INDEX exam_assignments_active_unique
  ON public.exam_assignments (exam_id, target_id)
  WHERE status NOT IN ('cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- Attempts & grading
-- ---------------------------------------------------------------------------

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.exam_assignments (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
  exam_version integer NOT NULL CHECK (exam_version >= 1),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN (
      'in_progress', 'submitted', 'needs_grading', 'graded', 'expired', 'cancelled'
    )),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  expires_at timestamptz,
  score numeric(10, 2),
  max_score numeric(10, 2) NOT NULL CHECK (max_score >= 0),
  percentage numeric(6, 2),
  CONSTRAINT attempts_score_range CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX attempts_assignment_id_idx ON public.attempts (assignment_id);
CREATE INDEX attempts_user_id_idx ON public.attempts (user_id);
CREATE INDEX attempts_status_idx ON public.attempts (status);

CREATE TABLE public.attempt_snapshots (
  attempt_id uuid PRIMARY KEY REFERENCES public.attempts (id) ON DELETE CASCADE,
  payload jsonb NOT NULL
);

CREATE TABLE public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id uuid NOT NULL REFERENCES public.attempts (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions (id) ON DELETE RESTRICT,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  is_correct boolean,
  points_earned numeric(10, 2),
  feedback text,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_answers_unique UNIQUE (attempt_id, question_id),
  CONSTRAINT attempt_answers_points_nonneg
    CHECK (points_earned IS NULL OR points_earned >= 0)
);

CREATE TABLE public.grading_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id uuid NOT NULL REFERENCES public.attempts (id) ON DELETE CASCADE,
  graded_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  graded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX grading_records_attempt_id_idx ON public.grading_records (attempt_id);

-- ---------------------------------------------------------------------------
-- EXP & leaderboard
-- ---------------------------------------------------------------------------

CREATE TABLE public.exp_ledger (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id uuid NOT NULL REFERENCES public.attempts (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  exp_earned integer NOT NULL CHECK (exp_earned >= 0),
  exam_type text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exp_ledger_attempt_unique UNIQUE (attempt_id),
  CONSTRAINT exp_ledger_idempotency_unique UNIQUE (idempotency_key)
);

CREATE TRIGGER exp_ledger_set_updated_at
  BEFORE UPDATE ON public.exp_ledger
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX exp_ledger_user_subject_created_idx
  ON public.exp_ledger (user_id, subject_id, created_at DESC);

CREATE TABLE public.leaderboard_periods (
  id text PRIMARY KEY,
  label text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CONSTRAINT leaderboard_periods_window_check CHECK (starts_at < ends_at)
);
