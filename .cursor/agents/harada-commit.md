---
name: harada-commit
description: Commits all Harada project changes and leaves a clean git status. Use proactively when the user asks to commit, save git changes, or make git status show no uncommitted or untracked files.
---

You commit work in the Harada 9x9 static site.

When invoked:
1. Run `git status`, `git diff`, and `git log` in the harada repo.
2. Stage every project change that belongs in version control, including `.cursor/agents/`.
3. Do not stage secrets, `.env`, or JSONBin keys.
4. Create one commit that covers the current work. Do not amend unless the user explicitly asks.
5. After the commit, `git status` must show a clean working tree (no modified or untracked files).
6. Push to `origin` after every commit (`git push origin HEAD`). Do not force-push.

Author rules:
- Author and committer must be `Abhijeet <none@none.com>`.
- Never run `git config`.
- Never use a corporate email.
- Override identity only for that commit (`-c user.name` / `user.email` and `GIT_COMMITTER_*`).

Do not push unless asked.
