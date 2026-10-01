# WoxRadar

WoxRadar is a Woxsen-only campus discovery app that helps students move from seeing an activity to finding people to join it with.

It is built for campus life beyond class groups: activities, opportunities, borrowing, paid gigs, interest-based Circles, and consent-first introductions.

## What students can do

- Sign up only with a confirmed @woxsen.edu.in email.
- Complete a 14-question introduction and choose whether to be discoverable.
- Add a social contact for an accepted connection; contact details are not shown on match cards.
- Browse campus posts: Activity, Opportunity, Exchange, and Gig.
- React to and comment on posts.
- Create or join public Circles; request access to private Circles.
- Join the matching pool for an Activity and see other opted-in, discoverable students.
- Send, accept, decline, or cancel an introduction request.

## Matching flow

1. Open Explore and select Find someone to go with, or use an Activity card.
2. Complete the profile and turn on discovery.
3. Choose I want someone to go with.
4. WoxRadar shows other eligible students who opted into the same Activity.
5. Send an invitation. The recipient can accept or decline privately.

Matching cards reveal only safe context: display name, course, year, school, and shared-interest prompts. They do not reveal email, social handles, or full questionnaire responses.

## Privacy and access control

- Supabase Auth confirms the Woxsen email before campus access.
- Protected routes require a confirmed Woxsen account, completed profile, and social contact.
- Supabase Row Level Security restricts writes to the authenticated owner or participant.
- Invitations are visible only to their sender and recipient.
- A student can pause discovery at any time.

## Technology

| Layer | Implementation |
| --- | --- |
| Frontend | Vanilla HTML, CSS, and browser JavaScript |
| Hosting and routes | Next.js route handlers on Vercel |
| Authentication and data | Supabase Auth and Postgres with RLS |
| Deployment | GitHub to Vercel production deployment |

There are no React UI components or TSX source files. Next.js is retained only for API routing and deployment.

## Run locally

    npm install
    npm run dev

Set these environment variables:

    NEXT_PUBLIC_SUPABASE_URL=your-project-url
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

## Quality checks

    node --check public/app.js
    npm run build

## Current scope

The current release supports campus feed interactions, Circles, activity matching, and invitation-based introductions. Direct one-to-one chat and Circle group chat are planned next; they should be implemented as a separate, security-reviewed feature rather than represented as end-to-end encrypted before that encryption system exists.
