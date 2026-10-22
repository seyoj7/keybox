# Project folder structure

Use this guide when working in this repository.

## Folder responsibilities

- `app/` contains all frontend code: Next.js App Router pages, layouts, global styles (`globals.css`), components, hooks, and client-safe utilities.
- `app/api/` contains Next.js API route entry points only. The path below `app/` determines the URL. Handlers stay thin and only call into `backend/`.
- `app/components/` contains all reusable UI components (`ui/` for primitives, `features/` for feature-specific ones).
- `app/hooks/` contains client-side React hooks.
- `app/lib/` contains utilities that are safe to run on the client. Never put secrets or DB access here.
- `backend/` sits at the repo root, outside `app/`. It contains server-side request handling and business logic. It holds files only, with no subfolders. Never import it from client components, and add `import "server-only"` to its modules.
- `types/` contains TypeScript types shared by frontend and backend.
- `config/` contains env parsing and constants. It is server-side only.
- `public/` contains static assets served by Next.js.

## Page rules

- Every page must have its own folder under `app/` (for example `app/about/page.tsx`). The folder name determines the URL.
- Every page folder must contain its own `.css` file (for example `app/about/page.css`), imported by that page's `page.tsx`. Page-specific styles do not go in `globals.css`.
- Reusable UI components must go inside `app/components/`. Do not define reusable components inside page folders.

## Backend files

Backend files are flat, with no subfolders and no feature prefix. The file names below are examples only, not a required set:

- `db.ts`
- `server.ts`

## Dependency direction

Route handlers in `app/api/` call into `backend/`. Backend files never import from `app/`. Frontend code in `app/` talks to the backend only through `app/api/` routes (or Server Actions that call into `backend/`).
