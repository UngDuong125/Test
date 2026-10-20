-- Lesson exams store theory on each section. Exam type `lesson` unlocks
-- instant per-question feedback. Matching / ordering reuse questions.answer jsonb.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'exams'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%practice%quiz%homework%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.exams DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_type_check
  CHECK (type IN ('practice', 'quiz', 'homework', 'worksheet', 'midterm', 'final', 'lesson'));

ALTER TABLE public.exam_sections
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '[]'::jsonb;
