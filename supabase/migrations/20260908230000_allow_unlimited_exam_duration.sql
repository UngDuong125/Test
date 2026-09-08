-- Allow duration = 0 for exams with no per-attempt time limit
-- (assignment deadline still applies when starting / expiring attempts).

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'exams'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%duration%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.exams DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.exams
  ADD CONSTRAINT exams_duration_check CHECK (duration >= 0);
