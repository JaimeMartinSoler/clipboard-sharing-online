# Rule: Run tests once development is finished

**When:** As soon as you believe a requirement is implemented — before committing,
pushing, or opening a PR.

**What to do:**

1. **Find how this repo tests.** Check, in order: project `CLAUDE.md`, the `README.md`,
   then the manifest (`package.json` scripts, `Makefile`, `pyproject.toml`,
   `pom.xml`, `build.gradle`, `go.mod`, etc.). Use the project's own command.
2. **Add or update tests first.** New behaviour needs new tests; changed behaviour
   needs updated tests. Cover the happy path plus the relevant edge and failure
   cases. Do not delete or weaken a test just to make it pass.
3. **Run the full relevant suite**, not just the file you touched. If the project
   distinguishes unit / integration / e2e, run at least the layers your change
   affects.
4. **Run lint / typecheck / format** if the project has them, and fix what they
   flag.
5. **Green before done.** If tests fail, fix the code (or the test if it was
   genuinely wrong) and re-run. Do not proceed to commit/PR with a red suite.

**Reporting:**

- State the exact command(s) you ran and the result.
- If something is failing for reasons outside this change (flaky, pre-existing,
  environment), say so explicitly rather than hiding it — never silently skip,
  `xfail`, or comment out a failing test to go green.
- If you genuinely cannot run the tests in this environment, say that clearly and
  describe what you would run.
