# WoxRadar

A campus connection platform for Woxsen students.

## Stack

- HTML and CSS in `public/`
- Browser JavaScript in `public/app.js`
- JavaScript API routes on Next.js/Vercel
- Supabase Auth for accounts and Woxsen email confirmation

There are no React components, TSX files or TypeScript source files in this version. Next.js remains only as the Vercel API and routing layer.

## Run locally

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The publishable values are returned by `/api/config`; no secret key is exposed to the browser.
