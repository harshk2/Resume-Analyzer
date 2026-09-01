# Evidence-Based Resume Analyzer

An evidence-based local resume review tool that turns an uploaded resume into a directional role-readiness or job-specific match score.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/resume-analyzer/src/App.tsx` — the upload flow, local text extraction, scoring rubric, and result presentation.
- `artifacts/resume-analyzer/src/index.css` — the visual language for the analyzer workspace.
- `artifacts/api-server` — shared API scaffold; not required by the current local analysis flow.

## Architecture decisions

- Resume analysis is local and deterministic in the first release; scores are based on extracted text, section structure, evidence language, and role vocabulary.
- A job description changes the result label to `Job-Specific Match Score`; without one, the result is `Role Readiness Score`.
- The evaluator never infers experience from a filename and never promises ATS passage, interviews, or hiring outcomes.
- PDF extraction uses selectable-text operators and DOCX extraction uses the browser ZIP/XML APIs, avoiding an external upload service for resume content.

## Product

- Upload or drop a PDF, DOCX, DOC, or TXT resume.
- Choose a primary role, optional secondary role, career stage, location preference, and optional job description.
- Review a score in `XX / 100` format, detected sections, parser risks, benchmark/job skill matches, word count, and prioritized next edits.
- Use the sample resume to preview the experience without uploading a document.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Scanned/image-only PDFs cannot be scored because the local parser intentionally does not perform OCR; export a text-based PDF or use DOCX/TXT.
- If a DOCX is malformed or encrypted, the local ZIP/XML extractor will return an error instead of guessing.
- The artifact build command needs workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for previewing.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
