# Open Context

AI context management for codebases — let Claude Code read, search, and update your project documentation via MCP.

Open Context is a desktop app + remote MCP server that maintains structured context documents for your code modules. Developers connect Claude Code to their projects with a single command, and the system keeps documentation in sync through git hooks, AI analysis, and a human-in-the-loop review flow.

## How It Works

```
Developer pushes code
       ↓
Git hook detects changed modules
       ↓
Claude Code analyzes diffs in background
       ↓
Submits updated context via MCP
       ↓
Admin reviews + approves in desktop app
       ↓
Claude Code reads fresh context next session
```

### For Developers (No Desktop App Needed)

An admin generates an API key and sends you the setup command:

```bash
claude mcp add --transport http open-context https://open-context-mcp.vercel.app/mcp \
  --header 'Authorization: Bearer oc_live_...'
```

That's it. Claude Code can now access your project context via 6 MCP tools:

| Tool | Description |
|------|-------------|
| `resolve_project` | Find project by working directory or name |
| `get_project_context` | Get full context document (llms.txt format) |
| `list_modules` | List all modules with coverage status |
| `get_module_context` | Get context for a specific module |
| `search_context` | Search across all project contexts |
| `update_module_context` | Submit updated context (goes through review) |

### For Admins (Desktop App)

The Electron app lets you:

- **Manage projects** — add projects, scan for modules, generate context
- **Review AI updates** — approve or reject context changes submitted via MCP
- **Track staleness** — see which modules are outdated based on git commits
- **Manage team** — create members, generate API keys, control per-project access

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron Desktop App (Next.js UI)          │
│  • Project & module management              │
│  • Context review & approval                │
│  • Team & API key management                │
├─────────────────────────────────────────────┤
│  Supabase (PostgreSQL)                      │
│  • Projects, modules, context documents     │
│  • Team members, API keys, access control   │
├─────────────────────────────────────────────┤
│  Remote MCP Server (Vercel)                 │
│  • API key auth (SHA256 hashed)             │
│  • 6 MCP tools for Claude Code              │
│  • Member-scoped project filtering          │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

- **Pending context workflow** — AI updates go through human review before becoming active
- **Git-aware staleness** — each module tracks its git snapshot; commits since = staleness
- **Smart git hooks** — pre-push spawns Claude in background (non-blocking)
- **Member-scoped access** — API keys with `member_id` only see assigned projects; admin keys see everything
- **Dual store pattern** — desktop app and MCP server both read/write the same Supabase database

## Development Setup

### Prerequisites

- Node.js 20+
- npm
- Supabase project (with migrations applied)
- Claude CLI (for smart context updates)

### 1. Install Dependencies

```bash
npm install
cd remote-server && npm install
```

### 2. Database Setup

Run the migrations in your Supabase SQL editor:

```bash
# In order:
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_team_members.sql
```

### 3. Environment Variables

**Desktop app** — configure in Settings page:
- Supabase URL, Service Role Key, Org ID
- API Key (for MCP auth)

**Remote server** (`remote-server/`) — set in Vercel:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Run the Desktop App

```bash
# Development (Electron + Next.js hot reload)
npm run electron:dev

# Or just the Next.js UI
npm run dev
```

### 5. Deploy the MCP Server

```bash
cd remote-server
vercel --prod
```

### 6. Build for Distribution

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux
```

## Project Structure

```
├── app/                    # Next.js pages (dashboard, projects, team, settings)
├── components/             # React components (shadcn/ui based)
├── electron/
│   ├── main.ts             # Electron main process entry
│   ├── preload.ts          # IPC bridge (context-isolated)
│   ├── ipc/                # IPC handlers (8 categories)
│   ├── store/              # SupabaseStore + SettingsStore
│   └── git/                # GitService + StalenessChecker
├── cli/
│   ├── update-context.ts   # CLI for git hook integration
│   └── smart-context-update.ts  # Background Claude analysis
├── remote-server/
│   ├── api/mcp.ts          # Vercel serverless MCP endpoint
│   ├── lib/                # Auth + Supabase data store
│   └── tools/              # 6 MCP tool implementations
├── hooks/                  # React hooks (useElectron, useProjects, etc.)
├── lib/                    # Shared types and utilities
└── supabase/migrations/    # Database schema
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run type checks: `npx tsc --noEmit` and `npx tsc --project tsconfig.mcp.json --noEmit`
5. Test the Electron app: `npm run electron:dev`
6. Commit and open a PR

### Build Verification

There are three TypeScript builds to check:

```bash
# Next.js + Electron renderer
npx tsc --noEmit

# CLI + MCP scripts
npx tsc --project tsconfig.mcp.json --noEmit

# Remote server
cd remote-server && npx tsc --noEmit
```

## License

MIT — see [LICENSE](LICENSE) for details.
