# Rule: Git Branch off `develop` for every requirement

**When:** Before writing any code for a new requirement, ticket, or feature.

**What to do:**

1. Make sure `develop` exists and is the integration branch. If the repo uses a
   different integration branch name, use that and tell the user.
2. Update your local copy of `develop` before branching:
   ```
   git checkout develop
   git pull --ff-only
   ```
3. Create one branch per requirement, branched **from `develop`**:
   ```
   git checkout -b <type>/<short-slug>
   ```
   - `<type>` is one of: `feature`, `fix`, `chore`, `docs`, `refactor`.
   - `<short-slug>` is a few kebab-case words, optionally prefixed with the
     ticket id, e.g. `feature/PROJ-123-user-login`.
4. Do all work for that requirement on that branch. **Never commit directly to
   `develop` or `main`.**

**Rules:**

- One requirement → one branch → one PR. Do not bundle unrelated changes.
- If you realise mid-stream that the work splits into independent requirements,
  ask for approval to either split into separate branches or continue with
  current branch.
- Branch from an up-to-date `develop`, not from another feature branch, unless
  the user explicitly asks you to stack on top of in-flight work.
