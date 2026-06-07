# MyVinyl

Premium vinyl collection manager — Discogs import, Camelot keys, BPM, vibe tags, smart recommendations, grid & shelf views, and printable crate labels.

> **AI agents:** Read [`../CONTEXT.md`](../CONTEXT.md) first (~50 lines).

## Quick start

```bash
cd my-vinyl
npm install
cp .env.example .env.local   # add API keys (see .env.example)
npm run dev
```

Open [http://localhost:5174](http://localhost:5174).

## Discogs API

Create a personal access token at [Discogs Developer Settings](https://www.discogs.com/settings/developers) and set `DISCOGS_TOKEN` in `.env.local`.

## Stack

Vite · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Sonner