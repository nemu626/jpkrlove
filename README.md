# jpkrlove

jpkrlove is a pnpm and Turborepo workspace containing an Expo mobile app, a
Next.js operations console, shared TypeScript packages, integration tests, and
a local Supabase project.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 11.17.0
- Docker-compatible container runtime for local Supabase

Install workspace dependencies from the repository root:

```bash
pnpm install
```

## Environment variables

Create untracked environment files for each application as needed. Never expose
the Supabase service-role key in either client application.

| Application      | Variable                        |
| ---------------- | ------------------------------- |
| Mobile           | `EXPO_PUBLIC_SUPABASE_URL`      |
| Mobile           | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Admin            | `NEXT_PUBLIC_SUPABASE_URL`      |
| Admin            | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Server-only code | `SUPABASE_SERVICE_ROLE_KEY`     |

For local development, obtain the Supabase URL and keys after startup with:

```bash
pnpm supabase status
```

## Development

Start the local Supabase services:

```bash
pnpm supabase start
```

Start every workspace development task:

```bash
pnpm dev
```

Run an individual application when only one surface is needed:

```bash
pnpm --filter @jpkrlove/mobile dev
pnpm --filter @jpkrlove/admin dev
```

Stop the local backend with `pnpm supabase stop`.

## Verification

Run the repository checks from the workspace root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm supabase --version
```
