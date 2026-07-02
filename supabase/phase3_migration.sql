-- =============================================================
-- Phase 3 Schema Extension
-- Run this AFTER you've applied the original schema.sql
-- (It's safe to skip if you're running schema.sql fresh)
-- =============================================================

-- Tighten student RLS: students can only insert/update attempts
-- during the quiz window (open_at <= now <= close_at).
-- If you already ran the Phase 1 schema.sql, drop the old policies first:

drop policy if exists "Students can insert their own attempts" on public.attempts;
drop policy if exists "Students can update their own attempts" on public.attempts;
drop policy if exists "Students can insert their own answers" on public.answers;
drop policy if exists "Students can update their own answers" on public.answers;

-- Replacement policies with time-window enforcement:

create policy "Students can insert their own attempts" on public.attempts
  for insert with check (
    auth.uid() = student_id
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id
        and q.is_published = true
        and (q.open_at is null or q.open_at <= now())
        and (q.close_at is null or q.close_at >= now())
    )
  );

create policy "Students can update their own attempts" on public.attempts
  for update using (
    auth.uid() = student_id
    and exists (
      select 1 from public.quizzes q
      where q.id = quiz_id
        and q.is_published = true
        and (q.open_at is null or q.open_at <= now())
        and (q.close_at is null or q.close_at >= now())
    )
  );

create policy "Students can insert their own answers" on public.answers
  for insert with check (
    exists (
      select 1 from public.attempts a
      join public.quizzes q on q.id = a.quiz_id
      where a.id = answers.attempt_id
        and a.student_id = auth.uid()
        and q.is_published = true
        and (q.open_at is null or q.open_at <= now())
        and (q.close_at is null or q.close_at >= now())
    )
  );

create policy "Students can update their own answers" on public.answers
  for update using (
    exists (
      select 1 from public.attempts a
      join public.quizzes q on q.id = a.quiz_id
      where a.id = answers.attempt_id
        and a.student_id = auth.uid()
        and q.is_published = true
        and (q.open_at is null or q.open_at <= now())
        and (q.close_at is null or q.close_at >= now())
    )
  );
