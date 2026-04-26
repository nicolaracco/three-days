---
description: Append a dated entry to DEVLOG.md
allowed-tools: Read, Write, Edit, Bash(date:*), Bash(git log:*), Bash(git diff:*)
---

Append a new entry to `DEVLOG.md` at the repo root. Create the file if it doesn't exist (with a one-line header).

The entry covers $ARGUMENTS — whatever the user wants logged. If $ARGUMENTS is empty, ask the user briefly what to log before writing.

Format each entry:

```
## YYYY-MM-DD — <one-line title>

<2–6 sentences. What happened, what was learned, what's next. No padding.>
```

Use today's date (`date +%Y-%m-%d`). Place the new entry at the top, below the header.

After writing, show the user the entry and ask if it should be edited.

The devlog feeds the Section 14.4 deliverable (500–1500 word retrospective at ship). Keep entries terse and honest — surprises and corrections are more valuable than victory laps.
