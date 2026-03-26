@AGENTS.md


## Project Context (Open Context) — IMPORTANT

This project uses **Open Context** for AI context management.

### REQUIRED: Update context after code changes
After you finish writing or modifying code, you MUST update the relevant module context:

1. Call `resolve_project` to get the project ID
2. Call `list_modules` to find which module(s) you changed
3. Call `update_module_context` with the updated context markdown for each affected module

This keeps the project documentation in sync. The context goes through a review flow —
the developer will see a diff and approve/reject your update in the Open Context app.

### How to access context
Use the MCP tools available to you:
- `resolve_project` — auto-detect this project from your cwd
- `get_project_context` — get the full context document
- `list_modules` — see all modules and their coverage status
- `get_module_context` — get detailed context for a specific module
- `search_context` — search across all context

### What triggers context updates
- **AI (you)**: Use `update_module_context` MCP tool after code changes (goes through approval)
- **Git hook**: Auto-marks affected modules as stale on push
- **Manual**: Developer clicks "Sync" on any module in Open Context
