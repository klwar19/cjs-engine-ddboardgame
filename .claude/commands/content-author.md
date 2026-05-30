---
description: Author a validated CJS content entry end-to-end (scaffold → fill → validate → write + manifest-register), delegating to the content-author subagent.
argument-hint: "<type> <intent> [name/id] [--world <world>]"
context: fork
agent: content-author
---

Author game content for this request:

$ARGUMENTS

Follow your content-author workflow exactly:

1. Identify the content **type** (run `npm run author -- --list` if unsure) and
   the **world** (ask if a world/campaign type needs one and none was given).
2. Read the type's brief (`data/ai-briefs/<type>.md`) and compact index
   (`data/ai-index/…`) for the contract and existing ids.
3. Scaffold (`npm run author -- <type> scaffold`), fill it in with real values
   that reuse existing ids, and give it a unique snake_case id.
4. Validate by piping to `npm run author -- <type> validate` and fix until clean.
5. Write with `npm run author -- <type> add` (prefer a dedicated `--file` for
   generated content). Confirm with `npm run content:lint`.
6. Report the id, the file written, and the manifest registration. Do not
   commit unless asked.
