# Workspace Rules & Guidelines

## Browser Usage & Quota Policy
- **Never open the browser or launch the browser subagent (`browser_subagent`) autonomously.**
- **Never ask for permission to open the browser.**
- Only invoke browser tools if the user explicitly and directly requests browser automation in their prompt.
- For all verification and testing, rely on automated unit/integration tests, command line test runners, build/typecheck validation, or direct HTTP/API requests (`read_url_content`).

## Code Comments & Token Efficiency
- **No unnecessary comments**: Write clean, self-documenting code. Do not add redundant or verbose inline comments.
- **Concise communication**: Avoid large, verbose summaries that consume tokens. Keep explanations succinct and direct.

## Task Lists & Progress Tracking
- **Always use markdown task lists** (`- [x]` for completed, `- [ ]` for pending) in responses to show exactly what was completed and what remains.
- **Always save implementation plans into markdown files in `docs/`** (`docs/<PLAN_NAME>.md`) to maintain persistent, version-controlled architecture and execution plans.

## Clean Architecture Structure
- **Domain Layer** (`src/domain/`): Core business entities, value objects, domain types, interfaces.
- **Application Layer** (`src/application/`): Use cases, application services, error definitions, DTOs.
- **Infrastructure Layer** (`src/infrastructure/`): Supabase clients, auth providers, storage, native bridges, API clients.
- **Presentation Layer** (`src/presentation/`): UI components, pages, hooks, contexts, styling/design tokens.

## Root Directory Hygiene
- **Never pollute the workspace root.**
- Documentation files (`.md`, `.pdf`) must be placed in `docs/` (only `README.md` and `AGENTS.md` remain at root).
- Tests must stay in `tests/`.
- Tooling and migration scripts belong in `scripts/`.
- No temporary files, test outputs, dumps, or junk scripts in the root directory.
