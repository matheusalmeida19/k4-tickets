# K4 Ingressos

Independent application at D:/Projects/K4/k4-tickets. Modify only this repository; never modify ../k4-lounge or the former ../K4Ingressos directory.
The user authorized the presentation-only Supabase/Vercel deployment on 2026-10-15. Preserve isolated local development. No real payments or messaging; other external actions still require user authorization. The user subsequently authorized persisted fictitious orders for the explicitly allowlisted demo event; never enable real payments. Deployment details: docs/RELEASE-2026-10-15.md.
Next.js 16: consult relevant installed node_modules/next/dist/docs before using framework APIs.
Use server-authoritative rules, Supabase persistence, restricted RLS, transactional idempotent confirmation.
Never print secrets, CPF or tracking credentials. No public payment-confirmation endpoint.
Run npm run lint, typecheck, test, test:integration and build. Docker stack is project K4Ingressos on ports 54331-54335.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
