# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WOSS Robotics Executive Application Portal (2026-2027) — a full-stack web app for managing executive position applications for the White Oaks Secondary School Robotics Club. Live at https://applications.wossrobotics.ca.

## Commands

```bash
npm run dev           # Start Vite dev server
npm run build         # Production build (vite build)
npm test              # Run vitest once
npm run test:watch    # Run vitest in watch mode
npm run test:coverage # Run vitest with coverage

# Deploy
npx vercel --prod     # Deploy frontend to Vercel

# Supabase
npx supabase db push                           # Push migrations to remote
npx supabase functions deploy <function-name>  # Deploy edge function
npx supabase secrets set KEY=VALUE             # Set edge function secrets
```

## Architecture

**Stack**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Supabase (Postgres + Auth + Edge Functions)

**Auth flow**: Email OTP via Supabase Auth → profile auto-created on first login → onboarding if profile incomplete → role-based routing (applicant/admin)

**Data model**:
- `profiles` — user info (name, grade, student number, role)
- `applications` — one per user; status drives the pipeline (`draft` → `submitted` → `under_review` → `interview_scheduled` → `accepted`/`rejected`)
- `application_positions` — junction table linking applications to positions; tracks `position_rank`, `ranking_note`, `score`, `eliminated`, `rank_order`
- `positions` — available executive roles
- `questions` — essay prompts (admin-managed)
- `responses` — applicant essay answers
- `activities` — extracurricular activities per user
- `honors` — awards and recognition per user
- `interview_bookings` — scheduled interviews with `meet_link` and `calendar_event_id`
- `reviews` — admin scoring per application with `position_scores` JSONB
- `settings` — portal-wide key-value config (jsonb values)

**Provider hierarchy**: `AuthProvider` → `DataProvider` → `MaintenanceGate` → `RouterProvider`

**Key hooks** (`src/app/lib/hooks.ts`):
- `useApplication(userId)` — single app with positions via junction
- `useAllApplications()` — admin view with profiles joined
- `useSettings()` — key-value settings from `settings` table (jsonb values)
- `usePositions()`, `useQuestions()` — ordered lists
- `useDeadlinePassed()` — deadline check against settings

**Layouts**: `ApplicantLayout` (sidebar with sectioned nav + progress widget) and `AdminLayout` wrap their respective route trees. Both are in `src/app/layouts/`.

**Routes** (`src/app/routes.tsx`):
- Public: `/`, `/login`, `/auth/confirm`
- Applicant (9 pages): `/applicant`, `/applicant/positions`, `/applicant/profile`, `/applicant/activities`, `/applicant/responses`, `/applicant/honors`, `/applicant/review`, `/applicant/interview`, `/applicant/decisions`
- Admin (8 pages): `/admin`, `/admin/applications/:id`, `/admin/interviews`, `/admin/rankings`, `/admin/responses`, `/admin/questions`, `/admin/communications`, `/admin/settings`

All protected routes use `ProtectedRoute` with `requiredRole`.

## Supabase Edge Functions

Located in `supabase/functions/`:

- **send-email**: Sends emails via Resend API. Admin-only. Requires `RESEND_API_KEY` secret. Accepts `{ to, subject, html }`.
- **create-interview-meeting**: Creates Google Calendar events with Meet links. Requires `GOOGLE_SERVICE_ACCOUNT_JSON` secret. Sends ICS calendar invite via Resend. Stores `meet_link` and `calendar_event_id` in `interview_bookings`.

Both functions require Bearer token auth and return JSON with CORS headers.

## Key Config Files

- `src/app/lib/interview-config.ts` — Cal.com booking URL for applicant self-scheduling (`CAL_BOOKING_URL`)
- `src/app/lib/email-templates.ts` — HTML email builders: `acceptanceEmail`, `rejectionEmail`, `interviewScheduledEmail`, `genericNotificationEmail`, `meetingUpdateEmail`, `decisionReleasedEmail`
- `src/app/data.ts` — shared constants: `STATUS_LABELS`, `ACTIVITY_TYPES`, `GRADE_LEVELS`, `RECOGNITION_LEVELS`

## Conventions

- **Styling**: Inline Tailwind with custom fonts — `Radio Canada Big` (sans), `Source Serif 4` (serif), `Geist Mono` (mono). Black/white minimal aesthetic. Font classes use bracket notation: `font-['Radio_Canada_Big',sans-serif]`.
- **Supabase client**: Imported from `src/app/lib/supabase.ts`. Never use service role key client-side.
- **Email pattern**: Fire-and-forget with `.catch(console.error)` — don't block UI on email failures.
- **Edit locking**: Applicant pages check `application.status !== "draft"` to disable edits after submission.
- **Progress tracking**: 6 sections (profile, positions, activities, responses, honors, review) tracked in both `ApplicantLayout` sidebar and `Dashboard`. Must stay in sync.
- **Settings values**: Stored as `jsonb` in settings table. Compare with both `=== true` and `=== "true"` when reading booleans.
- **Timezone**: Interview calendar uses `America/Toronto`.
- **Caching**: DataContext uses a 30-second stale time; call `refetchX()` methods to force refresh.

## Environment

```
VITE_SUPABASE_URL       # Supabase project URL
VITE_SUPABASE_ANON_KEY  # Supabase anon key (public)
```

Edge function secrets (set via `supabase secrets set`):
- `RESEND_API_KEY` — Resend email service
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google Calendar service account JSON
- `FROM_EMAIL` — defaults to `WOSS Robotics <tech@wossrobotics.ca>`
