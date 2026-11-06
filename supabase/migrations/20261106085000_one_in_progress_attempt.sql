-- One in-progress attempt per student per assignment.
-- Stops a double-click from building two snapshots.

CREATE UNIQUE INDEX attempts_one_in_progress_idx
  ON public.attempts (assignment_id, user_id)
  WHERE status = 'in_progress';
