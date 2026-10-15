# Implementation scope and evidence

Isolation: D:/Projects/K4 is not a Git repository. K4Ingressos is new and has no existing files. The entire new folder is the authorized scope; ../k4-lounge and ../k4-tickets are protected. No collisions. New independent Git repository; no commits/pushes/deploys.

Red exception: there is no executable application to exercise yet. Before domain implementation, add failing behavioral tests for CPF, commercial time boundaries and published simulation restrictions. After implementation, exercise the complete flow against the dedicated local PostgreSQL/Auth stack, including concurrent confirmation and RLS. Also run lint/types/build and browser validation; independent review must precede final delivery.

Contracts: lib/domain/types.ts owns DTOs. Backend owns lib/domain/rules.ts, lib/server/**, app/api/**, proxy.ts, scripts/demo.ts, scripts/provision-admin.ts, scripts/simulate.ts and backend/domain tests. Database owns supabase/migrations/** and tests/integration/database.test.ts. UI owns app pages/layout/styles excluding app/api, components/**. Root owns infrastructure, local environment bootstrap, remaining integration tests/docs and integration fixes. Do not overlap without handoff.

Tracking: /pedido/<random UUID>#acesso=<random opaque credential>. The fragment is exchanged via POST for an HttpOnly per-order cookie. Tokens are never URL paths/query parameters, logs or localStorage. QR codes contain a separate opaque ticket credential, no personal information.

No public financial webhook. Local simulation uses authenticated internal notifications invoked by a local-only script. Simulation is private-server-config only and denied in production, Vercel deployments, non-loopback application/DB URLs. Published checkout defaults unavailable.

Completed: dedicated local Supabase Auth/PostgreSQL, six migrations, public/private/admin UI, provider seam and isolated simulation, full persistent checkout-to-ticket flow. Final proof: lint, types, 39 tests and production build passed; independent read-only review Looks good with no remaining findings. See VERIFICATION.md for evidence and limits. No release/deploy/remote work performed.

Next / upcoming task: none — sequence complete.
