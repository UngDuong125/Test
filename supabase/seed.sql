-- TestArchive seed data (local / staging)
-- Run AFTER migrations. Does not seed plaintext passwords.
-- Local demo password for seeded users: ChangeMe123!
-- Hash is created with pgcrypto crypt() at insert time.

BEGIN;

-- Subjects (TagKey)
INSERT INTO public.subjects (id, label) VALUES
  ('math', 'Toán'),
  ('lang', 'Ngôn ngữ'),
  ('flang', 'Ngoại ngữ'),
  ('sci', 'Khoa học'),
  ('hist_geo', 'Lịch sử - Địa lý'),
  ('civic', 'Giáo dục công dân')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label;

-- Leaderboard academic periods (example 2026–2027)
INSERT INTO public.leaderboard_periods (id, label, starts_at, ends_at) VALUES
  (
    'term_2026_1',
    'HK1 2026–2027',
    '2026-08-15T00:00:00+07',
    '2027-01-15T00:00:00+07'
  ),
  (
    'term_2026_2',
    'HK2 2026–2027',
    '2027-01-16T00:00:00+07',
    '2027-06-15T00:00:00+07'
  )
ON CONFLICT (id) DO UPDATE
SET
  label = EXCLUDED.label,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at;

-- Demo users (fixed UUIDs for reproducible local fixtures)
-- must_change_password = true → force change on first login in app
INSERT INTO public.users (
  id,
  email,
  username,
  display_name,
  password_hash,
  role,
  status,
  must_change_password,
  email_verified_at
) VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'admin@testarchive.local',
    'admin',
    'Admin',
    crypt('ChangeMe123!', gen_salt('bf')),
    'admin',
    'active',
    true,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'teacher@testarchive.local',
    'teacher',
    'Giáo viên Toán',
    crypt('ChangeMe123!', gen_salt('bf')),
    'teacher',
    'active',
    true,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'student1@testarchive.local',
    'student1',
    'Học sinh A',
    crypt('ChangeMe123!', gen_salt('bf')),
    'student',
    'active',
    true,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'student2@testarchive.local',
    'student2',
    'Học sinh B',
    crypt('ChangeMe123!', gen_salt('bf')),
    'student',
    'active',
    true,
    now()
  )
ON CONFLICT (email) DO NOTHING;

-- Sample topics (math grade 7)
INSERT INTO public.topics (id, subject_id, name, grade) VALUES
  ('10000000-0000-4000-8000-000000000001', 'math', 'Phân số', 7),
  ('10000000-0000-4000-8000-000000000002', 'math', 'Phương trình bậc nhất', 7),
  ('10000000-0000-4000-8000-000000000003', 'sci', 'Tế bào', 7),
  ('10000000-0000-4000-8000-000000000004', 'flang', 'Present simple', 7)
ON CONFLICT (subject_id, name, grade) DO NOTHING;

-- Sample class owned by teacher
INSERT INTO public.classes (id, name, grade, owner_id) VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '7A1',
    7,
    '00000000-0000-4000-8000-000000000002'
  )
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.class_members (class_id, user_id) VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000004'
  )
ON CONFLICT DO NOTHING;

-- Sample question bank
INSERT INTO public.question_banks (
  id, name, description, subject_id, grade, owner_id
) VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    'Toán 7 - Phân số',
    'Ngân hàng mẫu cho seed local',
    'math',
    7,
    '00000000-0000-4000-8000-000000000002'
  )
ON CONFLICT (owner_id, name) DO NOTHING;

-- Sample published MCQ
INSERT INTO public.questions (
  id,
  type,
  subject_id,
  grade,
  difficulty,
  content,
  answer,
  explanation,
  points,
  tags,
  status,
  version,
  created_by
) VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    'multiple_choice',
    'math',
    7,
    'easy',
    '[{"type":"text","value":"Phân số nào bằng 1/2?"}]'::jsonb,
    '{"type":"single","value":"B"}'::jsonb,
    '{"text":"Vì 2/4 = 1/2.","steps":["Rút gọn 2/4"]}'::jsonb,
    1,
    ARRAY['fractions'],
    'published',
    1,
    '00000000-0000-4000-8000-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.question_options (question_id, id, content, "order") VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    'A',
    '{"type":"text","value":"1/3"}'::jsonb,
    1
  ),
  (
    '40000000-0000-4000-8000-000000000001',
    'B',
    '{"type":"text","value":"2/4"}'::jsonb,
    2
  ),
  (
    '40000000-0000-4000-8000-000000000001',
    'C',
    '{"type":"text","value":"2/5"}'::jsonb,
    3
  ),
  (
    '40000000-0000-4000-8000-000000000001',
    'D',
    '{"type":"text","value":"3/4"}'::jsonb,
    4
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.question_topic_links (question_id, topic_id) VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.question_bank_items (bank_id, question_id) VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )
ON CONFLICT DO NOTHING;

COMMIT;
