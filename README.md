# ClassQuiz Phase 1

Welcome to ClassQuiz! This is a private quiz platform built for a single school.

## Tech Stack
- Frontend: React.js (Vite) + TypeScript
- UI: shadcn/ui + Tailwind CSS
- Backend/DB/Auth: Supabase

## Setup Instructions

### 1. Supabase Project Setup
1. Create an account on [Supabase](https://supabase.com/) and create a new project.
2. In the Supabase dashboard, go to SQL Editor and run the contents of `supabase/schema.sql` to create all tables and RLS policies.
3. Enable Email authentication in Authentication -> Providers -> Email. Ensure you don't require email confirmations if you want instant signups for testing.

### 2. Environment Variables
1. Copy the `.env.example` file and rename it to `.env.local` (or `.env`).
2. Add your Supabase project URL and anon key to `.env.local`:
   `VITE_SUPABASE_URL=your_actual_url`
   `VITE_SUPABASE_ANON_KEY=your_actual_anon_key`

### 3. Running the App Locally
1. Run `npm install` to install dependencies.
2. Run `npm run dev` to start the development server.

### 4. Application Flow & Testing
1. **Admin Registration**: Sign up as an administrator by checking the "I am an admin" checkbox at the `/register` or `/admin` page.
2. **Generate Class Code**: Log in as the admin and generate a class code from the Admin Dashboard.
3. **Student Registration**: Using a separate incognito window, sign up as a student. You MUST provide the class code created by the admin to successfully register.
4. **Dashboards**: Admins land on the Admin Dashboard, students land on the Student Dashboard. Unauthorized access redirects to the correct dashboard or login.
