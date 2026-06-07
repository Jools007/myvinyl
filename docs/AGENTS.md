# MyVinyl — Agent Instructions

> **Start every task with [`../CONTEXT.md`](../CONTEXT.md)** (~50 lines). Load `MISSION.md`, `ROADMAP.md`, or `SCHEMA.md` only when relevant.

## Workflow

1. Read `CONTEXT.md`.
2. Identify roadmap phase and mission fit.
3. Respect catalog vs collection separation (even with `localStorage` today).
4. Implement minimal focused diffs.
5. Verify: `npm run build`.

## Doc map

| Document | Use when |
|----------|----------|
| `CONTEXT.md` | Every task |
| `MISSION.md` | UX, copy, aesthetics, scope |
| `ROADMAP.md` | Phase / sequencing |
| `SCHEMA.md` | Data model principles & types |
| `docs/schema-full.md` | Implementing Drizzle / Postgres tables |

Trade-offs: **MISSION** → product · **ROADMAP** → timing · **SCHEMA** → structure.