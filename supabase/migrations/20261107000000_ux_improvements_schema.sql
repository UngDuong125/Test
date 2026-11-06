-- UX improvements that need schema changes (additive; existing rows keep working).
-- See doc/features: authentication-and-authorization (7b), leaderboard (11),
-- vocabulary-srs (15), manual-grading (chấm nhanh).

-- 1. Students without an email address (accounts created by import / teacher).
--    UNIQUE (email) still holds for non-null values; NULLs never collide.
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

-- 2. Students can hide themselves from the public leaderboard (they still see their rank).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS leaderboard_hidden boolean NOT NULL DEFAULT false;

-- 3. "Khó nhớ" review result: keeps the interval step, neither advances nor resets.
ALTER TABLE public.vocabulary_review_events
  DROP CONSTRAINT IF EXISTS vocabulary_review_events_result_check;
ALTER TABLE public.vocabulary_review_events
  ADD CONSTRAINT vocabulary_review_events_result_check
  CHECK (result IN ('pass', 'fail', 'hard'));

-- Streaks read a student's review days; cards → events by card_id is already indexed.

-- 4. Per-question manual grading marker. On submit, manual questions are stored with
--    points_earned = 0, so "0 points" and "not graded yet" were indistinguishable.
ALTER TABLE public.attempt_answers
  ADD COLUMN IF NOT EXISTS manual_graded_at timestamptz;

-- 5. Feedback snippets a teacher reuses while grading ("Thiếu đơn vị", …).
CREATE TABLE IF NOT EXISTS public.feedback_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_templates_owner_text_unique UNIQUE (owner_id, text)
);

CREATE INDEX IF NOT EXISTS feedback_templates_owner_id_idx
  ON public.feedback_templates (owner_id);

-- 6. Who reset whose password / imported which accounts. Never stores the password.
CREATE TABLE IF NOT EXISTS public.account_audit_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('temporary_password_reset', 'account_imported')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_audit_events_target_idx
  ON public.account_audit_events (target_user_id, created_at DESC);

-- 7. One row per student per local day with at least one review: streaks and the daily
--    goal read a few hundred tiny rows instead of every review event.
CREATE TABLE IF NOT EXISTS public.student_review_days (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  reviews integer NOT NULL DEFAULT 0 CHECK (reviews >= 0),
  PRIMARY KEY (user_id, day)
);

-- Backfill from existing reviews (school time zone; matches VOCABULARY_TIME_ZONE default).
INSERT INTO public.student_review_days (user_id, day, reviews)
SELECT c.user_id, (e.reviewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, count(*)
FROM public.vocabulary_review_events e
JOIN public.student_vocabulary_cards c ON c.id = e.card_id
GROUP BY 1, 2
ON CONFLICT (user_id, day) DO NOTHING;
