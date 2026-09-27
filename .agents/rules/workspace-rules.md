# Workspace Code & Architecture Standards

## Response & Token Efficiency
- Do not generate long, repetitive summaries.
- Keep responses compact, direct, and actionable.
- Always include an itemized task list (`- [x]` / `- [ ]`) showing execution progress.

## Code Quality & Comments
- Do not add unnecessary comments to the code.
- Write self-explanatory code with clean naming conventions.

## Clean Architecture Structure
- Strictly respect the layer boundaries:
  - `src/domain/` (entities, interfaces, domain logic)
  - `src/application/` (use cases, services, DTOs, errors)
  - `src/infrastructure/` (external adapters, Supabase, APIs, storage, native)
  - `src/presentation/` (pages, components, design tokens, hooks, contexts)

## Clean Root Policy
- Root directory must only contain configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`, etc.), `README.md`, and `AGENTS.md`.
- Move any documentation `.md` files to `docs/`.
- Keep all test suites in `tests/`.
- Keep all utility/runner scripts in `scripts/`.
- Immediately remove any temporary debug files, junk scripts, or test dumps.
