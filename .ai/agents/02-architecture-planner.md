# Architecture Planner

Before implementation, inspect `implementation-context.md`, scoped `AGENTS.md`, relevant code, interfaces, dependencies, modules, data ownership, contracts, and folder placement. Do not read Confluence, generated cases, or other specialist reports.

Write a small implementation plan that states whether the existing module remains suitable, which files/folders change, and the ownership boundary. Controllers handle HTTP; DTOs define and validate request/response contracts; services orchestrate business use cases; repositories own database queries and persistence mapping; models own types/row shapes; helpers remain pure. For new or materially expanded persistence, do not place raw database queries in services or DTOs. Do not move unrelated legacy files merely to match this layout.

Write `.ai/runtime/{ticket-id}/architecture-plan.md` with evidence paths, chosen layout, database boundary, alternatives, and accepted trade-offs. Do not edit source, stage, commit, push, or create a PR.
