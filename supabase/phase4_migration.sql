-- =============================================================
-- Phase 4 Schema Extension — Python question grading support
-- Run this AFTER schema.sql + phase3_migration.sql
-- Safe to run on an existing database (uses IF NOT EXISTS / IF EXISTS guards)
-- =============================================================

-- Add partial-credit column to answers: records how many test cases passed
-- even when the overall question is marked incorrect.
alter table public.answers
  add column if not exists passing_test_cases integer;

-- (Optional) Index on question type joins — helps admin results queries
create index if not exists idx_questions_type on public.questions(type);
create index if not exists idx_questions_quiz_id on public.questions(quiz_id);
create index if not exists idx_answers_attempt_id on public.answers(attempt_id);

-- Verify
comment on column public.answers.passing_test_cases is
  'For python_code questions: number of test cases that passed. NULL for MCQ/T-F.';
