# Architecture Overview

WOSS Robotics Executive Application Portal (2026-2027) — a full-stack web application that manages the entire lifecycle of club executive position applications, from submission through interviews to final decisions.

Live at **https://applications.wossrobotics.ca**

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Is There a Backend? Do Users Touch the DB Directly?](#is-there-a-backend-do-users-touch-the-db-directly)
3. [Repository Layout](#repository-layout)
4. [Frontend Architecture](#frontend-architecture)
   - [Entry Point](#entry-point)
   - [Routing](#routing)
   - [Layouts](#layouts)
   - [Pages](#pages)
   - [Components](#components)
   - [Hooks](#hooks)
   - [Auth Context](#auth-context)
5. [Backend Architecture (Supabase)](#backend-architecture-supabase)
   - [Authentication](#authentication)
   - [Database Schema](#database-schema)
   - [Row-Level Security](#row-level-security)
   - [Edge Functions](#edge-functions)
6. [Data Flow](#data-flow)
7. [Application Lifecycle](#application-lifecycle)
8. [Email System](#email-system)
9. [Interview System](#interview-system)
10. [Settings System](#settings-system)
11. [Styling Conventions](#styling-conventions)
12. [Environment & Deployment](#environment--deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 (inline utility classes) |
| Router | React Router v7 (`createBrowserRouter`) |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Serverless functions | Supabase Edge Functions (Deno) |
| Email delivery | Resend API |
| Calendar integration | Google Calendar API (service account) |
| Hosting | Vercel (frontend) |

---

## Is There a Backend? Do Users Touch the DB Directly?

### Short answer

**Yes, there is a backend. No, users never talk to the database directly.**

### What is the backend?

The backend is **Supabase** — a fully managed, cloud-hosted platform that provides:

| Service | What it does here |
|---|---|
| **PostgreSQL database** | Stores all application data (profiles, applications, positions, responses, etc.) |
| **Supabase Auth** | Manages user identity, JWT sessions, and email OTP delivery |
| **PostgREST API** | Auto-generated REST/RPC layer in front of Postgres — this is the only way the client ever reads or writes data |
| **Edge Functions** | Deno-based serverless functions for privileged operations (email delivery, Google Calendar) |

Supabase infrastructure is hosted on **Supabase's cloud platform** (AWS under the hood). The project URL is stored in `VITE_SUPABASE_URL`.

### How do users interact with data?

```
Browser (React app)
    │
    │  Supabase JS client (anon key — public, safe to ship in browser)
    │  supabase.from("applications").select(...)
    │
    ▼
Supabase PostgREST API  ←  authenticates every request with the user's JWT
    │
    │  Row-Level Security policies run inside Postgres on every query
    │
    ▼
PostgreSQL (Supabase cloud)
```

The Supabase JS client (`src/app/lib/supabase.ts`) is initialised with the **anon (public) key** — not the service-role key. This key alone grants zero access; every operation is gated by Postgres **Row-Level Security (RLS)** policies that run server-side.

- An applicant calling `supabase.from("applications").select("*")` only receives their own row — Postgres enforces `WHERE user_id = auth.uid()` automatically via RLS.
- An admin gets all rows because the RLS policy additionally checks `profiles.role = 'admin'` for their JWT.
- No user can bypass RLS by crafting a custom query — the anon key never grants direct SQL access.

### Privileged operations (edge functions)

Some operations need more than a regular user JWT can provide (e.g. sending email, creating calendar events). These go through **Supabase Edge Functions**:

```
Admin browser
    │  fetch(supabase.functions.url + "/send-email", { Bearer: <admin JWT> })
    ▼
Edge Function (Deno, Supabase cloud)
    │  Verifies JWT, checks admin role
    │  Uses RESEND_API_KEY / GOOGLE_SERVICE_ACCOUNT_JSON (secrets, never exposed to browser)
    ▼
Resend API / Google Calendar API
```

The service-role key and third-party API secrets are **only ever available inside edge functions** — they are never sent to the browser.

### Where is everything hosted?

| Component | Hosted on |
|---|---|
| React frontend | **Vercel** (CDN, global edge) |
| PostgreSQL + Auth + PostgREST | **Supabase cloud** (managed AWS) |
| Edge Functions | **Supabase Edge Runtime** (Deno Deploy, co-located with the DB) |
| Email delivery | **Resend** (third-party SaaS) |
| Calendar events | **Google Calendar API** (Google Cloud) |

---

## Repository Layout

```
roboticsapps2/
├── index.html                  # Vite HTML entry
├── vite.config.ts
├── postcss.config.mjs
├── vercel.json                 # SPA fallback rewrite rule
├── supabase-schema.sql         # Reference snapshot of the DB schema (migrations in supabase/migrations/ are the canonical source)
├── supabase-rls-fix.sql        # Standalone RLS patch script
│
├── public/                     # Static assets (favicon, logo)
│
├── src/
│   ├── main.tsx                # React root mount
│   ├── styles/                 # Global CSS (fonts, Tailwind, theme)
│   ├── assets/                 # Image assets
│   └── app/
│       ├── App.tsx             # AuthProvider wrapper
│       ├── routes.tsx          # All route definitions
│       ├── data.ts             # Shared constants (status labels, enums)
│       ├── lib/
│       │   ├── supabase.ts     # Supabase client (anon key)
│       │   ├── AuthContext.tsx # Auth state + profile context
│       │   ├── ProtectedRoute.tsx  # Role-gated route wrapper
│       │   ├── hooks.ts        # Data-fetching hooks
│       │   ├── utils.ts        # Shared utility functions
│       │   ├── email-templates.ts  # HTML email builders
│       │   └── interview-config.ts # Interview CC list, duration, title
│       ├── layouts/
│       │   ├── ApplicantLayout.tsx # Sidebar + progress widget
│       │   └── AdminLayout.tsx     # Admin sidebar nav
│       ├── pages/
│       │   ├── Home.tsx        # Public landing page
│       │   ├── Login.tsx       # OTP email login
│       │   ├── AuthConfirm.tsx # Magic-link / OTP token exchange
│       │   ├── Onboarding.tsx  # First-login profile completion
│       │   ├── applicant/      # 9 applicant-facing pages
│       │   └── admin/          # 7 admin-facing pages
│       └── components/
│           ├── ui/             # Generic UI primitives
│           └── figma/          # Design-imported components
│
└── supabase/
    ├── config.toml
    ├── functions/
    │   ├── send-email/         # Resend email edge function
    │   └── create-interview-meeting/  # Google Calendar edge function
    ├── migrations/             # Incremental SQL migrations
    └── templates/              # Supabase Auth email templates (HTML)
```

---

## Frontend Architecture

### Entry Point

`src/main.tsx` mounts the React app:
```
ReactDOM → <App /> → <AuthProvider> → <RouterProvider router={router} />
```

`App.tsx` wraps the entire app in `AuthProvider`, making the auth context (user, profile, session) available everywhere.

### Routing

All routes are defined in `src/app/routes.tsx` using React Router's `createBrowserRouter`. There are three tiers:

| Tier | Path prefix | Protection |
|---|---|---|
| Public | `/`, `/login`, `/auth/confirm` | None |
| Applicant | `/applicant/*` | `ProtectedRoute` with `requiredRole="applicant"` |
| Admin | `/admin/*` | `ProtectedRoute` with `requiredRole="admin"` |

`ProtectedRoute` reads from `AuthContext` and redirects unauthenticated users to `/login` or users with the wrong role to their own section.

**Applicant routes** (9 pages, children of `ApplicantLayout`):

| Path | Component |
|---|---|
| `/applicant` | `ApplicantDashboard` |
| `/applicant/positions` | `ApplicantPrograms` |
| `/applicant/profile` | `ApplicantProfile` |
| `/applicant/activities` | `ApplicantActivities` |
| `/applicant/responses` | `ApplicantEssays` |
| `/applicant/honors` | `ApplicantHonors` |
| `/applicant/review` | `ApplicantReview` |
| `/applicant/interview` | `ApplicantInterview` |
| `/applicant/decisions` | `ApplicantDecisions` |

**Admin routes** (7 pages, children of `AdminLayout`):

| Path | Component |
|---|---|
| `/admin` | `AdminDashboard` |
| `/admin/applications/:id` | `AdminApplicationReview` |
| `/admin/settings` | `AdminSettings` |
| `/admin/communications` | `AdminCommunications` |
| `/admin/interviews` | `AdminInterviews` |
| `/admin/questions` | `AdminQuestions` |
| `/admin/responses` | `AdminResponses` |

### Layouts

**`ApplicantLayout`** — rendered as the parent outlet for all `/applicant/*` routes. Contains:
- Left sidebar with section navigation grouped by phase (profile, positions, application, submission)
- Progress widget showing completion across the 6 tracked sections: *profile, positions, activities, responses, honors, review*
- Edit locking: pages check `application.status !== "draft"` to disable form inputs after submission

**`AdminLayout`** — rendered as the parent outlet for all `/admin/*` routes. Contains:
- Left sidebar with admin navigation links

### Pages

**Public pages:**
- `Home` — landing/marketing page
- `Login` — email-only OTP entry; calls `signInWithOtp`
- `AuthConfirm` — receives the OTP token from the magic-link URL and calls `verifyOtp` to complete sign-in, then redirects

**Onboarding:**
- `Onboarding` — shown to applicants whose profile is missing required fields (first name, last name, phone, grade, student number); saves to the `profiles` table

**Applicant pages** follow a linear form-section model. Each page:
1. Reads from the Supabase `applications`, `activities`, `honors`, or `responses` tables
2. Saves changes back via direct Supabase client calls
3. Disables editing once the application is no longer in `draft` status

**Admin pages:**
- `AdminDashboard` — lists all applications with status filters; uses `useAllApplications`
- `AdminApplicationReview` — detailed view of one applicant's full application (positions, essays, activities, honors, scoring)
- `AdminSettings` — manage `settings` key-value pairs (open/close application window, release decisions, set dates)
- `AdminCommunications` — compose and send bulk emails to applicant cohorts via the `send-email` edge function
- `AdminInterviews` — manage interview slots, view bookings, send Google Meet invites via the `create-interview-meeting` edge function
- `AdminQuestions` — CRUD for custom application questions stored in the `questions` table
- `AdminResponses` — read-only view of all applicant essay responses across the pool

### Hooks

All data fetching uses custom React hooks defined in `src/app/lib/hooks.ts`:

| Hook | Purpose |
|---|---|
| `useApplication(userId)` | Fetches the single application for a user, with positions via junction table |
| `useAllApplications()` | Admin view — all applications with profiles joined |
| `useSettings()` | Key-value settings map from `settings` table; exposes `updateSetting` |
| `usePositions()` | Ordered list of available exec positions |
| `useQuestions()` | Active, ordered list of application questions |

All hooks use `useCallback` + `useEffect` and expose a `refetch` function for manual refresh.

### Auth Context

`src/app/lib/AuthContext.tsx` exposes a React context with:

```ts
{
  user: User | null           // Supabase Auth user object
  session: Session | null     // JWT session
  profile: Profile | null     // Row from public.profiles (includes role)
  loading: boolean
  profileError: string | null
  signInWithOtp(email)        // Sends magic link / OTP
  verifyOtp(email, token)     // Completes sign-in
  signOut()
  refreshProfile()            // Re-fetches the profile row
}
```

On mount, it calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`. If no `profiles` row exists yet (new user, trigger race), it inserts one automatically.

---

## Backend Architecture (Supabase)

### Authentication

Supabase Auth is configured for **email OTP only** — no passwords. The flow:

1. User enters email on `/login` → `supabase.auth.signInWithOtp({ email })` → Supabase sends OTP email
2. User enters 6-digit code on `/login` (or clicks magic link → `/auth/confirm`) → `supabase.auth.verifyOtp(...)` exchanges token for session
3. Supabase triggers `on_auth_user_created` → auto-inserts a row into `public.profiles`
4. `AuthProvider` fetches the profile row and stores `role` in context

Auth email templates are customized HTML files in `supabase/templates/` (confirm, magic_link, invite, recovery, email_change).

### Database Schema

The Postgres schema has 12 tables. Core relationships:

```
auth.users
    │
    └── profiles (1:1)
            │
            ├── applications (1:1 per user)
            │       │
            │       ├── application_positions (junction: many positions)
            │       │       └── positions
            │       │
            │       ├── responses (one per question)
            │       │       └── questions
            │       │
            │       ├── interview_bookings (1:1)
            │       │       └── interview_slots
            │       │
            │       ├── reviews (many admin reviewers)
            │       │
            │       └── decisions (1:1)
            │
            ├── activities (many per user)
            └── honors (many per user)

settings (global key-value config)
```

**Table summary:**

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; stores name, grade, student number, `role` |
| `positions` | Available exec roles (title, description, `is_open`, `sort_order`) |
| `questions` | Admin-configurable questions; can be scoped to a position or global |
| `applications` | One per user; holds the aggregate status pipeline |
| `application_positions` | Junction: which positions the applicant applied for |
| `responses` | One row per (application, question) pair; holds essay text |
| `activities` | Extracurricular activities linked to a user profile |
| `honors` | Awards/recognition linked to a user profile |
| `interview_slots` | Admin-created time slots (date, start/end time, interviewer) |
| `interview_bookings` | Applicant books a slot; holds `meet_link` and `calendar_event_id` |
| `reviews` | Admin scoring per application; `scores` stored as JSONB |
| `decisions` | Acceptance/rejection letter per application; `is_read` flag |
| `settings` | Global key-value store; values are JSONB |

**Application status pipeline** (stored on `applications.status`):

```
draft → submitted → under_review → interview_scheduled → accepted / rejected
```

### Row-Level Security

Every table has RLS enabled. The general policy pattern is:

- **Applicants** can only read/write their own rows (checked via `auth.uid()`)
- **Admins** can read/write all rows (checked via a subquery on `profiles.role = 'admin'`)
- **Public** tables (`positions`, `questions`, `settings`, `interview_slots`) allow anonymous reads

The security definer function `handle_new_user()` runs on `auth.users` insert to create the profile row without requiring the user to have write permission on `profiles` at that moment.

### Edge Functions

Located in `supabase/functions/`, deployed with `npx supabase functions deploy <name>`.

#### `send-email`

- **Trigger**: Called by admin pages (Communications, Decisions, Interviews) via `fetch` with a Bearer token
- **Auth**: Requires the caller's Supabase JWT — admin-only
- **Payload**: `{ to: string, subject: string, html: string }`
- **Behavior**: Forwards to Resend API using `RESEND_API_KEY` secret; returns `{ success: true }` or error JSON
- **CORS**: Returns headers for browser calls

#### `create-interview-meeting`

- **Trigger**: Called when an admin confirms an interview booking
- **Auth**: Requires admin JWT
- **Payload**: Interview slot details (applicant email, time, interviewer)
- **Behavior**: Creates a Google Calendar event with a Meet link using `GOOGLE_SERVICE_ACCOUNT_JSON`; stores `meet_link` and `calendar_event_id` back into `interview_bookings`
- **Config**: CC recipients, event duration, and title template are in `src/app/lib/interview-config.ts`

---

## Data Flow

### Applicant submission flow

```
Applicant fills sections (profile / positions / activities / responses / honors)
    │  [direct Supabase client writes]
    ▼
applicant clicks "Submit" on Review page
    │  [PATCH applications.status = 'submitted']
    ▼
Admin sees application on Dashboard
    │  [useAllApplications() SELECT with profiles join]
    ▼
Admin opens ApplicationReview
    │  [SELECT * with application_positions, responses, activities, honors, decisions]
    ▼
Admin scores (reviews table) and advances status
    │  [PATCH applications.status]
    ▼
Admin schedules interview / sends decision email
    │  [send-email edge function + create-interview-meeting edge function]
    ▼
Applicant sees updated status and decision letter
```

### Auth flow

```
/login (enter email)
    │  signInWithOtp()
    ▼
Supabase sends OTP email
    │
    ▼
/login (enter code) or /auth/confirm (magic link)
    │  verifyOtp()
    ▼
AuthProvider fetches profile row
    │
    ├── profile.role === 'applicant'  →  redirect to /applicant
    │       │
    │       └── profile incomplete?  →  redirect to /onboarding
    │
    └── profile.role === 'admin'  →  redirect to /admin
```

---

## Application Lifecycle

The application portal operates in configurable phases controlled by settings flags:

| Setting key | Controls |
|---|---|
| `application_window_open` | Whether applicants can create/edit/submit applications |
| `interview_scheduling_open` | Whether applicants can book interview slots |
| `decisions_released` | Whether the Decisions page shows the letter |
| `cycle_name` | Display name shown in the portal (e.g. "2026-2027 Executive Applications") |
| `application_deadline` | Displayed deadline string |
| `interview_window` | Displayed interview window string |
| `decisions_date` | Displayed decisions date string |

Settings values are JSONB in Postgres; when reading booleans, compare against both `=== true` and `=== "true"` to handle both stored formats.

---

## Email System

Emails are built client-side with `src/app/lib/email-templates.ts` and delivered by the `send-email` edge function via Resend.

Available template functions:

| Function | Used for |
|---|---|
| `acceptanceEmail(firstName, position, portalUrl)` | Accepted decision notification |
| `rejectionEmail(firstName, position, portalUrl)` | Rejected decision notification |
| `interviewScheduledEmail(...)` | Interview invite with Meet link |
| `meetingUpdateEmail(...)` | Generic meeting update |
| `genericNotificationEmail(...)` | Bulk communications from admin |
| `decisionReleasedEmail(firstName, portalUrl)` | Batch email when decisions go live |

All email sends are **fire-and-forget**: `.catch(console.error)` — the UI never blocks on email delivery.

The sender address defaults to `WOSS Robotics <tech@wossrobotics.ca>` (overridable via `FROM_EMAIL` secret).

---

## Interview System

1. Admin creates time slots in the `interview_slots` table (`AdminInterviews` page)
2. When admin advances an application to `interview_scheduled`, the applicant sees the `ApplicantInterview` page listing available slots
3. Applicant books a slot → row inserted into `interview_bookings`; the slot's `is_booked` flag flips to `true`
4. Admin triggers Google Meet creation → `create-interview-meeting` edge function → stores `meet_link` + `calendar_event_id` in the booking row
5. Confirmation email (with Meet link) sent via `send-email` edge function; CC recipients are configured in `src/app/lib/interview-config.ts`
6. Timezone for all calendar operations: `America/Toronto`

---

## Settings System

`useSettings()` returns the entire `settings` table as a flat `Record<string, any>` map. Values are stored as JSONB in Postgres — this means string values arrive as plain JS strings, but boolean values may be stored either as a real JSON boolean (`true`) or as the string `"true"` depending on how they were inserted. Always compare with both `=== true` and `=== "true"` to handle both cases; the Supabase JS client unwraps the JSONB automatically so no manual JSON parsing is needed in application code.

`updateSetting(key, value)` performs an upsert: tries `UPDATE` first, falls back to `INSERT` if the key doesn't exist yet. Local state is only updated after a confirmed DB write.

---

## Styling Conventions

- **Framework**: Tailwind CSS v4, applied inline as utility classes — no separate CSS modules
- **Fonts** (loaded via `src/styles/fonts.css`):
  - `Radio Canada Big` → sans-serif body (`font-['Radio_Canada_Big',sans-serif]`)
  - `Source Serif 4` → serif accents
  - `Geist Mono` → monospace / code labels
- **Aesthetic**: Black/white minimal; all colours handled by Tailwind utilities or inline style strings in email templates
- **Edit locking**: Applicant form pages check `application.status !== "draft"` and add `disabled` or `pointer-events-none` when the application has been submitted

---

## Environment & Deployment

### Frontend environment variables (`.env`)

```
VITE_SUPABASE_URL       # Supabase project URL
VITE_SUPABASE_ANON_KEY  # Supabase anon key (public, safe to expose)
```

### Edge function secrets (set via `npx supabase secrets set KEY=VALUE`)

```
RESEND_API_KEY                  # Resend email delivery
GOOGLE_SERVICE_ACCOUNT_JSON     # Google Calendar service account
FROM_EMAIL                      # Sender address (optional)
```

### Deployment

- **Frontend**: Deployed to Vercel with `npx vercel --prod`. `vercel.json` contains a catch-all rewrite to `index.html` for SPA routing.
- **Supabase migrations**: Applied with `npx supabase db push`
- **Edge functions**: Deployed individually with `npx supabase functions deploy <function-name>`
