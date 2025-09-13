# Be Ausome — Parent Support API UI (v1.0)

This repo turns your **Parent Support (v2.7)** Custom GPT into a free, API-backed tool you can embed on Shopify and deploy on Vercel.

## What’s inside
- **prompts/**: Original v2.7 files (verbatim) + `prompts/system.md` runtime pointer.
- **schemas/**: JSON Schemas for structured outputs (`support_plan`, `social_story`, `routine_plan`).
- **app/**: Next.js 14 App Router pages + `/api/chat` route.
- **shopify/**: `sections/ausome-bot.liquid` for easy iframe embed.
- **public/**: room for assets; `embed-resizer.js` placeholder.
- **.env.example**: env vars (`OPENAI_API_KEY`, `OPENAI_MODEL`, `ALLOWED_ORIGINS`).

## Run locally
```bash
pnpm i
cp .env.example .env
pnpm dev
```

## Deploy on Vercel
1. Push to GitHub, **Import** in Vercel.
2. Set env vars: `OPENAI_API_KEY`, `OPENAI_MODEL` (e.g., `gpt-5o-mini`), `ALLOWED_ORIGINS` with your Shopify domain(s) and the Vercel URL.
3. Deploy. Test `/parent-support` page.

## Embed on Shopify (Theme)
1. Upload `shopify/sections/ausome-bot.liquid` into your theme.
2. Create a Page (e.g., “Parent Support”), assign the section, set the iframe URL to your Vercel page (e.g., `https://YOURAPP.vercel.app/parent-support`).
3. Ensure your app’s `ALLOWED_ORIGINS` includes your Shopify domain.

## API Contract
`POST /api/chat`
```json
{ "message": "string", "mode": "text|support_plan|social_story|routine_plan" }
```
- **text**: plain, concise guidance.
- **support_plan**: conforms to `schemas/support_plan.schema.json`.
- **social_story**: conforms to `schemas/social_story.schema.json`.
- **routine_plan**: conforms to `schemas/routine_plan.schema.json`.

## Parity & Tone
- Runtime system prompt points at your original v2.7 instructions in `prompts/original/`.
- Keep temperature low. Add your own golden prompts in `tests/` (optional) to snapshot tone.

## Notes
- This scaffold intentionally avoids any image generation to keep outcomes reliable for parents.
- If you later add more structured outputs, drop their JSON Schemas into `/schemas` and extend the switch in `/api/chat`.
