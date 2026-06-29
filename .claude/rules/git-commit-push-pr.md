# Rule: Hands-off git commit + push + PR

**When:** A requirement is fully implemented, tests pass, and docs are updated.

This rule lets you complete the delivery without stopping to ask, **provided**
the work is on a dedicated requirement branch (see `.claude/rules/git-branching.md`)
and never targets `main`/`develop` directly.

**Steps:**

1. **Stage intentionally.** Review `git status` and `git diff`. Stage only files
   that belong to this requirement. Never blanket-`git add -A` over unrelated
   changes or stray local files.
2. **Commit** with a clear message:
   - Subject: imperative, ≤ 72 chars, e.g. `Add user login endpoint`.
   - Body: what changed and why (not how). Reference the ticket if there is one.
   - Group into multiple commits if the change has distinct logical steps.
3. **Push** the branch and set upstream:
   ```
   git push -u origin <branch>
   ```
4. **Open a PR** with the `gh` CLI, targeting `develop`:
   ```
   gh pr create --base develop --head <branch> --title "<subject>" --body "<body>"
   ```
   The PR body should cover: what & why, how it was tested, and any follow-ups or
   out-of-scope notes. Link the ticket.
5. Report the PR URL back to the user.

**Guardrails (do not skip):**

- Do **not** push to or open a PR against `main`/`develop` as the source branch.
- Do **not** force-push a shared branch.
- Do **not** commit secrets, credentials, `.env` files, or large build artifacts.
- Do **not** skip hooks (`--no-verify`) or bypass signing unless the user asks.
- If a pre-commit/CI hook fails, fix the underlying issue — never bypass it.
- If anything is ambiguous or risky (rebasing shared history, deleting branches,
  changing protected settings), stop and ask first.
