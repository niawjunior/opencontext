@AGENTS.md


## Project Context (Open Context)

This project uses **Open Context** for AI context management. Module-level documentation
is maintained in Open Context and served via MCP.

### How to access context
Use the MCP tools available to you:
- `resolve_project` — auto-detect this project from your cwd
- `get_project_context` — get the full context document
- `list_modules` — see all modules and their coverage status
- `get_module_context` — get detailed context for a specific module
- `search_context` — search across all context

### When to update context
After making **significant code changes** (new features, refactored modules, changed APIs),
update the relevant module context using the `update_module_context` MCP tool:

```
update_module_context({
  projectId: "<resolved-project-id>",
  modulePath: "path/to/changed/module",
  context: "Updated markdown describing what this module does..."
})
```

Or rebuild the full context document:
```bash
OPEN_CONTEXT_DATA_DIR="/Users/niawjunior/Library/Application Support/open-context/data" node "/Users/niawjunior/Desktop/lightwork/open-context/dist-mcp/mcp-server/update-context.js" --regenerate-all
```

### What triggers context updates
- **Manual**: Click "Sync" on any module in Open Context
- **Claude Code**: Use `update_module_context` MCP tool after code changes
- **Git hook**: Auto-rebuilds on push (if configured)
- **CLI**: `node "/Users/niawjunior/Desktop/lightwork/open-context/dist-mcp/mcp-server/update-context.js" --changed-files <files>`
