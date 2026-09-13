# FitSync v9 — Production-ready deployment package

FitSync is a personalized fitness web app with adaptive workouts, nutrition/recipe discovery, recovery tracking, progress, and an authenticated AI coach named Ami.

## What changed in the production build
- Supabase email/password authentication is required; no plaintext local-password fallback.
- Persistent user state is stored in Supabase Postgres with Row Level Security.
- Supabase auth session restoration and password recovery are implemented.
- Ami API requires a valid Supabase access token before it can use your OpenAI key.
- Ami receives a reduced, non-sensitive fitness context; health, smoking and alcohol onboarding fields are excluded from the AI request.
- Security headers and a Content Security Policy are configured in `vercel.json`.
- Added privacy/terms starter pages, favicon, manifest and robots.txt.
- Existing recipe explorer, workout integrity flow, progress journey and dashboard remain.

## 1. Supabase
1. Create a Supabase project.
2. Authentication → Providers → Email: keep email/password enabled. Hosted Supabase projects require email verification by default.
3. Authentication → URL Configuration: set Site URL to your final Vercel URL and add the same URL as a Redirect URL.
4. SQL Editor: run `schema.sql`.
5. Copy the Project URL and browser-safe publishable key into `supabase-config.js`. Never put a secret/service-role key there.
6. For production email delivery, configure custom SMTP instead of relying on the limited default mail service.

## 2. Vercel environment variables
Add these to Project Settings → Environment Variables for Production (and Preview if desired):
- `OPENAI_API_KEY` — your server-side OpenAI API key (sensitive).
- `OPENAI_MODEL` — optional, default `gpt-5-mini`.
- `SUPABASE_URL` — your Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable/anon key.

Never put `OPENAI_API_KEY` in browser code.

## 3. GitHub → Vercel
Replace the files in your existing repository with this package, commit and push to the production branch (normally `main`). Vercel will automatically create a production deployment when the production branch is updated.

## 4. Production test checklist
- Create a new account and verify email.
- Log in from a second browser/device.
- Complete onboarding.
- Change a profile value, refresh, and confirm it remains.
- Log a workout/meal/water entry, refresh and verify persistence.
- Use Forgot password and complete the reset flow.
- Ask Ami a fitness question and confirm it responds.
- Log out and confirm the app returns to login.
- Open Supabase Database → Policies/Security Advisor and confirm RLS is enabled.

## Important
This is production-ready architecture, but legal/privacy text, branding ownership, monitoring, billing limits and final security review should be completed before a public commercial launch.


## v9 upgrades
- Light/Dark theme toggle remembered in the browser; the separate System mode has been removed.
- Ami is explicitly fitness-only at both client and server layers.
- Branded Supabase signup email template and setup guide included in `SUPABASE-EMAIL-SETUP.md`.
- Added a 30-item Indian food nutrition reference with protein, carbs, calories and indicative price data.
- Added Today's Focus dashboard logic and removed the System theme option.

## Ami intelligence upgrade (v9)
Ami now uses a server-side Vercel function at `api/ami.js` and the OpenAI Responses API. The browser sends the signed-in user's fitness context, recent journey data and short-term chat history; the server validates the Supabase session before calling OpenAI. No OpenAI secret is stored in browser code.

Set these Vercel environment variables:
- `OPENAI_API_KEY` — required, server-side only.
- `OPENAI_MODEL` — optional; defaults to `gpt-5.6-luna`.
- `SUPABASE_URL` — your Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable/anon key.

Ami can now personalize answers using the user's goal, experience, diet, activity, available equipment, workout time, current energy/recovery, logged nutrition/hydration/sleep, workout history and recent progress. It also remembers the recent conversation during the current session so follow-up questions can refer to earlier messages.
