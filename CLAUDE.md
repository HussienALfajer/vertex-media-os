# Vertex OS — Claude Code Instructions

@AGENTS.md

Treat `AGENTS.md` as the canonical repository-wide agent contract.

Do not duplicate its rules in this file.

Before modifying files:

* Check whether a more specific `AGENTS.md` applies to the target directory.
* Inspect the existing implementation and repository state before making assumptions.
* Read only the documentation relevant to the current task.

For implementation tasks, carry the requested work through implementation and relevant verification rather than stopping after analysis or a proposal unless the user explicitly requested planning only.

For review or audit tasks, do not modify the repository unless changes were explicitly requested.

Keep plans proportional to the task. Trivial changes do not require elaborate planning; significant architectural, cross-domain, migration, or refactoring work should be planned before editing.

Do not expand the requested scope merely because adjacent improvements are possible.

If repository evidence conflicts with documentation in a way that materially affects correctness, security, data integrity, architecture, or public contracts, surface the conflict instead of silently choosing a new direction.
