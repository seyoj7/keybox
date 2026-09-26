---
trigger: always_on
---

---
trigger: always_on
description: "Defines the project's frontend, backend, database, shared, and component folder structure."
---

# Project Structure Rules

Follow these folder-organization rules whenever creating or modifying files.

## Frontend

All frontend code must be inside:

`app/`

Use:

`app/components/`

for reusable frontend components.

Inside `components/`, organize common UI components such as:

- `Footer`
- `Navbar`
- `Button`
- `Modal`

For Next.js App Router projects, use `layout.tsx` for the page/layout structure rather than creating an unnecessary `Body` component.

## Backend

All backend and server-side code must be located inside:

`backend/`