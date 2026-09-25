-- Vocabulary spaced repetition (SRS) — additive tables only.
-- Spec: doc/features/vocabulary-srs.md

CREATE TABLE public.vocabulary_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  term text NOT NULL CHECK (char_length(trim(term)) > 0),
  reading text,
  definition text NOT NULL CHECK (char_length(trim(definition)) > 0),
  example text,
  media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER vocabulary_entries_set_updated_at
  BEFORE UPDATE ON public.vocabulary_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX vocabulary_entries_subject_grade_status_idx
  ON public.vocabulary_entries (subject_id, grade, status);
CREATE INDEX vocabulary_entries_created_by_idx
  ON public.vocabulary_entries (created_by);
CREATE INDEX vocabulary_entries_tags_gin_idx
  ON public.vocabulary_entries USING gin (tags);

CREATE TABLE public.vocabulary_banks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject_id text NOT NULL REFERENCES public.subjects (id) ON DELETE RESTRICT,
  grade integer NOT NULL CHECK (grade BETWEEN 6 AND 9),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vocabulary_banks_owner_name_unique UNIQUE (owner_id, name)
);

CREATE TRIGGER vocabulary_banks_set_updated_at
  BEFORE UPDATE ON public.vocabulary_banks
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX vocabulary_banks_owner_id_idx ON public.vocabulary_banks (owner_id);
CREATE INDEX vocabulary_banks_subject_grade_idx
  ON public.vocabulary_banks (subject_id, grade);

CREATE TABLE public.vocabulary_bank_items (
  bank_id uuid NOT NULL REFERENCES public.vocabulary_banks (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.vocabulary_entries (id) ON DELETE CASCADE,
  PRIMARY KEY (bank_id, entry_id)
);

CREATE INDEX vocabulary_bank_items_entry_id_idx
  ON public.vocabulary_bank_items (entry_id);

CREATE TABLE public.vocabulary_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_id uuid NOT NULL REFERENCES public.vocabulary_banks (id) ON DELETE RESTRICT,
  target_type text NOT NULL DEFAULT 'user' CHECK (target_type = 'user'),
  target_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  source_class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  available_from timestamptz NOT NULL,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vocabulary_assignments_window_check CHECK (
    deadline IS NULL OR available_from < deadline
  )
);

CREATE INDEX vocabulary_assignments_target_id_idx
  ON public.vocabulary_assignments (target_id);
CREATE INDEX vocabulary_assignments_bank_id_idx
  ON public.vocabulary_assignments (bank_id);
CREATE INDEX vocabulary_assignments_source_class_id_idx
  ON public.vocabulary_assignments (source_class_id);
CREATE UNIQUE INDEX vocabulary_assignments_active_unique
  ON public.vocabulary_assignments (bank_id, target_id)
  WHERE status = 'active';

CREATE TABLE public.student_vocabulary_cards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.vocabulary_assignments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.vocabulary_entries (id) ON DELETE RESTRICT,
  interval_step integer NOT NULL DEFAULT 0
    CHECK (interval_step BETWEEN 0 AND 4),
  next_review_at timestamptz NOT NULL,
  last_reviewed_at timestamptz,
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  pass_count integer NOT NULL DEFAULT 0 CHECK (pass_count >= 0),
  fail_count integer NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  status text NOT NULL DEFAULT 'learning'
    CHECK (status IN ('learning', 'mastered', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_vocabulary_cards_unique
    UNIQUE (user_id, entry_id, assignment_id)
);

CREATE TRIGGER student_vocabulary_cards_set_updated_at
  BEFORE UPDATE ON public.student_vocabulary_cards
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX student_vocabulary_cards_due_idx
  ON public.student_vocabulary_cards (user_id, next_review_at)
  WHERE status = 'learning';
CREATE INDEX student_vocabulary_cards_assignment_id_idx
  ON public.student_vocabulary_cards (assignment_id);

CREATE TABLE public.vocabulary_review_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id uuid NOT NULL REFERENCES public.student_vocabulary_cards (id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('pass', 'fail')),
  interval_step_before integer NOT NULL CHECK (interval_step_before BETWEEN 0 AND 4),
  interval_step_after integer NOT NULL CHECK (interval_step_after BETWEEN 0 AND 4),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vocabulary_review_events_card_id_idx
  ON public.vocabulary_review_events (card_id);
CREATE INDEX vocabulary_review_events_reviewed_at_idx
  ON public.vocabulary_review_events (reviewed_at DESC);
