---
name: crosmos-save
description: Submit a user-requested memory to Crosmos when the user explicitly says to remember, save, or store specific information.
---

# Crosmos save

Use this skill only when the user explicitly asks to remember, save, or store specific information.
Do not save assistant-inferred facts, routine decisions, or completed turns already captured by the
automatic Stop hook.

Submit the user's exact text as one private memory:

```sh
node "{{CROSMOS_RUNTIME_DIR}}/commands/save.js" "<text>"
```

Report that the memory was submitted. Submission is asynchronous, so do not claim processing is
complete.
