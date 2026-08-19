---
name: crosmos-status
description: Check Crosmos authentication, selected space, hooks, runtime, and skills when the user asks about Crosmos status or connectivity.
---

# Crosmos status

Use this skill when the user asks whether Crosmos is connected, installed, configured, or working.

Run:

```sh
node "{{CROSMOS_RUNTIME_DIR}}/commands/status.js"
```

Report the command output. Do not reinstall or change configuration unless the user asks.
