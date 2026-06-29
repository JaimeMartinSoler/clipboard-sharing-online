# Rule: Check and update docs once development is finished

**When:** After the code is implemented and tests pass, before commiting,
pushing, or opening the PR.

A change is not done until the documentation around it is true again.

**What to review and update:**

1. **`/docs`** — if the repo has a docs directory, update any page affected by the
   change: API references, guides, configuration tables, examples, screenshots,
   changelogs. Search docs for names you renamed or removed.
2. **`README.md`** — update if the change touches: setup/install steps, usage
   examples, supported options/flags, environment variables, requirements, or the
   feature list. Keep examples runnable and correct.
3. **`CLAUDE.md`** — update if the change alters how the repo is built, tested,
   run, or structured, or introduces a convention future contributors (human or
   agent) need to know.
4. **Inline & reference docs** — docstrings, comments, OpenAPI/JSON schemas, type
   stubs, and `.env.example` if config changed.

**How to do it:**

- Grep for the old names, paths, commands, and flags you changed; fix every stale
  hit, not just the obvious file.
- Keep docs consistent with the code you just wrote — no aspirational or outdated
  instructions.
- If nothing user-facing changed, state explicitly that no docs needed updating
  (so it is a deliberate decision, not an oversight).
- Include doc changes in the same PR as the code they describe.
