# WOSS Robotics Executive Application Portal

A full-stack web application for managing executive position applications for the **White Oaks Secondary School Robotics Club**. Applicants apply for specific executive roles, complete a multi-section application, attend interviews, and receive decisions — all through a single portal.

Live at **https://applications.wossrobotics.ca**

---

## Features

### For Applicants
- **Email OTP login** — passwordless sign-in, no account creation required
- **Position selection** — browse available executive roles and rank preferences
- **Multi-section application** — profile, extracurricular activities, essay responses, and awards/honors
- **Deadline tracking** — live countdown and dismissible deadline reminders in the sidebar
- **Progress tracking** — sidebar progress indicator shows completion across all 6 sections
- **Interview scheduling** — self-schedule via Cal.com once invited; view meeting link in-portal
- **Decision letters** — view acceptance or rejection outcomes directly in the portal
- **Edit locking** — application becomes read-only after submission

### For Admins
- **Application dashboard** — overview statistics, timeline, and per-position breakdowns
- **Detailed review** — read each applicant's full submission with inline scoring per position
- **Per-position scoring** — score applicants on experience, essays, leadership, and fit for each position they applied to
- **Rankings** — sortable, filterable position-wise ranking table with elimination toggles and bulk accept/reject
- **Interview management** — create Google Calendar events with Meet links; send ICS invites via email
- **Communications** — send bulk or individual emails using pre-built branded templates
- **Question management** — add, edit, reorder, and deactivate essay prompts
- **Settings** — configure application deadline, enable/disable maintenance mode, manage portal state

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4, Radix UI primitives |
| Routing | React Router v7 |
| Backend | Supabase (Postgres, Auth, Edge Functions) |
| Email | Resend API |
| Calendar | Google Calendar API + Google Meet |
| Interview scheduling | Cal.com |
| Deployment | Vercel (frontend), Supabase Cloud (backend) |
| Testing | Vitest, Testing Library |

---

## Application Workflow

```
Applicant logs in (OTP)
    ↓
Onboarding (name, grade, student number)
    ↓
Selects positions + ranks preferences
    ↓
Fills out application sections:
    - Profile (personal info)
    - Activities (extracurriculars)
    - Responses (essay questions)
    - Honors (awards & recognition)
    ↓
Submits before deadline
    ↓
Admin reviews → scores per position → moves to Under Review
    ↓
Admin schedules interview → Google Meet link created + emailed
    ↓
Applicant self-schedules via Cal.com
    ↓
Admin ranks applicants → marks accepted / rejected
    ↓
Decisions released → applicants notified by email + view in portal
```

---

## Application Status Pipeline

| Status | Meaning |
|---|---|
| `draft` | Application started, not yet submitted |
| `submitted` | Submitted by applicant, awaiting review |
| `under_review` | Admin is actively reviewing |
| `interview_scheduled` | Interview booked |
| `accepted` | Applicant accepted to a position |
| `rejected` | Application not successful |

---

## Project Structure

```
src/
├── app/
│   ├── App.tsx                # Root component (AuthProvider → DataProvider → Router)
│   ├── routes.tsx             # All route definitions
│   ├── data.ts                # Shared constants (status labels, activity types, etc.)
│   ├── lib/
│   │   ├── AuthContext.tsx    # Session, profile, OTP auth methods
│   │   ├── DataContext.tsx    # Cached data (positions, questions, applications)
│   │   ├── hooks.ts           # Custom hooks wrapping DataContext
│   │   ├── supabase.ts        # Supabase client
│   │   ├── email-templates.ts # Branded HTML email builders
│   │   └── interview-config.ts # Cal.com booking URL
│   ├── layouts/
│   │   ├── ApplicantLayout.tsx # Sidebar nav + progress for applicants
│   │   └── AdminLayout.tsx     # Sidebar nav for admins
│   └── pages/
│       ├── applicant/         # 9 applicant pages
│       └── admin/             # 8 admin pages
supabase/
├── functions/                 # Deno edge functions (send-email, create-interview-meeting)
├── migrations/                # Postgres schema migrations
└── config.toml
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Supabase CLI
- A Supabase project (or local instance via `supabase start`)

### Setup

```bash
# Install dependencies
npm install

# Create a .env.local with your Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Start the dev server
npm run dev
```

### Running Tests

```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Deploying Edge Functions

```bash
npx supabase functions deploy send-email
npx supabase functions deploy create-interview-meeting

# Set required secrets
npx supabase secrets set RESEND_API_KEY=...
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON=...
npx supabase secrets set FROM_EMAIL="WOSS Robotics <tech@wossrobotics.ca>"
```

---

## Environment Variables

**Frontend** (`.env.local`):
```
VITE_SUPABASE_URL       Supabase project URL
VITE_SUPABASE_ANON_KEY  Supabase anon key (safe to expose client-side)
```

**Edge function secrets** (via `supabase secrets set`):
```
RESEND_API_KEY              Resend email delivery
GOOGLE_SERVICE_ACCOUNT_JSON Google Calendar service account
FROM_EMAIL                  Sender address (optional, has default)
```

---

## Design

Minimal black-and-white aesthetic with three custom fonts:
- **Radio Canada Big** — primary UI font
- **Source Serif 4** — display/heading accents
- **Geist Mono** — code and monospaced elements

All UI is built with inline Tailwind classes. Radix UI provides accessible primitives (dialogs, dropdowns, tooltips, etc.).
