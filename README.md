This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## How a robot gets designed

`POST /api/generate` runs a team of Gemini agents (see `docs/briefs/8-multi-agent-design.md`):

1. Interpreter reads the task and picks room targets.
2. Mobility, Arm & tool and Sensing agents pick parts in parallel, each from its own slice of the catalog.
3. Power & brain and Routine agents follow, using the loads from step 2.
4. Code (the budgeter) picks one option per agent under the budget. Over budget still returns the closest design, with the failed check shown.
5. Master agent combines the parts. Fact-checker agent rewrites any claim the catalog data does not support.
6. `derive.ts` checks the result; failures go back to the agent that owns them (max 2 repairs).

The loading screen shows what each agent is doing. Set `AGENTS=single` to use the old single-call designer, `DEMO_MODE=1` for cached results.

Build manuals are written for the robot (`POST /api/manual`): code lays out the pages, wires and parts from the checked pin map, Gemini writer agents (one per book) write the words, a fact-checker agent reviews them, and photo agents (vendor page, Google Search, Gemini vision check) find real product photos, cached in `public/part-images/`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
