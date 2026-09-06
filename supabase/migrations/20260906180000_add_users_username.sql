-- Add username for login (email OR username).
-- Safe to run after 20260906000000_init_target_schema.sql if that version
-- did not yet include username.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username citext;

-- Backfill from email local-part for rows missing username
UPDATE public.users
SET username = lower(regexp_replace(split_part(email::text, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'))
WHERE username IS NULL;

-- Ensure uniqueness if local-parts collide (append short id suffix)
UPDATE public.users u
SET username = lower(left(regexp_replace(split_part(u.email::text, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'), 24) || '_' || substr(replace(u.id::text, '-', ''), 1, 6))
WHERE u.username IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.users o
    WHERE o.username = u.username AND o.id <> u.id
  );

-- Pad too-short derived usernames
UPDATE public.users
SET username = username || '_user'
WHERE char_length(username::text) < 3;

ALTER TABLE public.users
  ALTER COLUMN username SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_format'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_username_format CHECK (
      username ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$'
    );
  END IF;
END $$;
