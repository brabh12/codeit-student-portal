-- Schema for ClassQuiz built with Supabase

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('admin', 'student')),
  full_name text not null,
  class_name text,
  avatar_url text,
  total_points integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Class Codes Table
create table public.class_codes (
  id uuid default uuid_generate_v4() primary key,
  code text not null unique,
  class_name text not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Quizzes Table
create table public.quizzes (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete cascade not null,
  open_at timestamp with time zone,
  close_at timestamp with time zone,
  duration_seconds integer,
  is_published boolean default false not null,
  subject text,
  quiz_type text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Questions Table
create table public.questions (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  type text not null check (type in ('mcq', 'true_false', 'python_code')),
  question_text text not null,
  options jsonb, -- e.g., ["Option 1", "Option 2"]
  correct_answer text not null,
  points_base integer default 10 not null,
  code_starter text,
  test_cases jsonb, -- e.g., [{"input": "2,3", "expected": "5"}]
  order_index integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Attempts Table
create table public.attempts (
  id uuid default uuid_generate_v4() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  student_id uuid references public.profiles(id) on delete cascade not null,
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  submitted_at timestamp with time zone,
  status text not null check (status in ('in_progress', 'submitted', 'graded')) default 'in_progress',
  unique(quiz_id, student_id)
);

-- 6. Answers Table
create table public.answers (
  id uuid default uuid_generate_v4() primary key,
  attempt_id uuid references public.attempts(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  student_answer text,
  is_correct boolean,
  time_taken_seconds integer,
  points_awarded integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(attempt_id, question_id)
);

-- Row Level Security (RLS) Setup
alter table public.profiles enable row level security;
alter table public.class_codes enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

-- RLS Policies

-- Profiles: 
-- Anyone can insert a profile on sign up (we'll enforce logic in UI/auth, but users can always see their own profile)
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
-- Admins can view all profiles
create policy "Admins can view all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
-- Users can insert their own profile
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
-- Users can update their own profile
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Class Codes:
-- Public can read active class codes (for registration validation)
create policy "Anyone can read active class codes" on public.class_codes for select using (is_active = true);
-- Admins can do everything on their class codes
create policy "Admins can insert class codes" on public.class_codes for insert with check (
  auth.uid() = created_by and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Admins can update their class codes" on public.class_codes for update using (auth.uid() = created_by);
create policy "Admins can delete their class codes" on public.class_codes for delete using (auth.uid() = created_by);
create policy "Admins can view their class codes" on public.class_codes for select using (auth.uid() = created_by);

-- Quizzes:
-- Admins can CRUD their own quizzes
create policy "Admins have full CRUD on their quizzes" on public.quizzes for all using (auth.uid() = created_by);
-- Students can read published quizzes that are currently open (or will be open)
create policy "Students can view published quizzes" on public.quizzes for select using (
  is_published = true 
  and (open_at is null or open_at <= now())
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'student')
);

-- Questions:
-- Admins can CRUD questions for their quizzes
create policy "Admins can CRUD questions for their quizzes" on public.questions for all using (
  exists (
    select 1 from public.quizzes where id = questions.quiz_id and created_by = auth.uid()
  )
);
-- Students can read questions for published quizzes
create policy "Students can read questions for published quizzes" on public.questions for select using (
  exists (
    select 1 from public.quizzes where id = questions.quiz_id and is_published = true
  )
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'student')
);

-- Attempts:
-- Admins can view all attempts for their quizzes
create policy "Admins can view attempts for their quizzes" on public.attempts for select using (
  exists (select 1 from public.quizzes where id = attempts.quiz_id and created_by = auth.uid())
);
-- Admins can update attempts for their quizzes (e.g. grading)
create policy "Admins can update attempts for their quizzes" on public.attempts for update using (
  exists (select 1 from public.quizzes where id = attempts.quiz_id and created_by = auth.uid())
);
-- Students can CRUD their own attempts
create policy "Students can see their own attempts" on public.attempts for select using (auth.uid() = student_id);

create policy "Students can insert their own attempts" on public.attempts for insert with check (
  auth.uid() = student_id
  and exists (
    select 1 from public.quizzes q 
    where q.id = quiz_id 
    and q.is_published = true 
    and (q.open_at is null or q.open_at <= now())
    and (q.close_at is null or q.close_at >= now())
  )
);

create policy "Students can update their own attempts" on public.attempts for update using (
  auth.uid() = student_id
  and exists (
    select 1 from public.quizzes q 
    where q.id = quiz_id 
    and q.is_published = true 
    and (q.open_at is null or q.open_at <= now())
    and (q.close_at is null or q.close_at >= now())
  )
);

-- Answers:
-- Admins can view and update answers for attempts on their quizzes
create policy "Admins can view answers" on public.answers for select using (
  exists (
    select 1 from public.attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.created_by = auth.uid()
  )
);
create policy "Admins can update answers" on public.answers for update using (
  exists (
    select 1 from public.attempts a
    join public.quizzes q on q.id = a.quiz_id
    where a.id = answers.attempt_id and q.created_by = auth.uid()
  )
);
-- Students can CRUD answers for their own attempts
create policy "Students can see their own answers" on public.answers for select using (
  exists (select 1 from public.attempts where id = answers.attempt_id and student_id = auth.uid())
);

create policy "Students can insert their own answers" on public.answers for insert with check (
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

create policy "Students can update their own answers" on public.answers for update using (
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

-- Admin capability to update any profile (e.g. adjust total_points)
create policy "Admins can update all profiles" on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

