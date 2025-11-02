# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read the docs

Read the docs before responding to the user:

- [roadmap.md](roadmap.md)
- [README.md](README.md)
- <https://modelcontextprotocol.io/tutorials/building-mcp-with-llms>
- <https://docs.anthropic.com/en/docs/claude-code/hooks>

## Core Development Principles

### KISS (Keep It Simple, Stupid)
- Write simple, straightforward code
- Avoid over-engineering solutions
- Prefer clarity over cleverness

### YAGNI (You Aren't Gonna Need It)
- Only implement features that are currently needed
- Don't add functionality for potential future use cases
- Remove unused code and dependencies

### DRY (Don't Repeat Yourself)
- Extract common logic into reusable functions
- Avoid code duplication
- Maintain a single source of truth for each piece of knowledge

## Code Style

### Comments Policy
- **NO inline comments in code**
- Only add documentation when necessary (JSDoc for public APIs, complex algorithms)
- Code should be self-explanatory through clear naming and structure

### Documentation Files Policy
- **NEVER create documentation files** (*.md, README, CONTRIBUTING, etc.) unless explicitly requested by the user
- Do not proactively suggest or create documentation
- Focus on code implementation, not documentation

## Git Commit Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:

### Format
```
<type>: <description>
```

### Rules
- **One single sentence in English**
- **No additional lines, no body, no footer**
- Keep it concise and descriptive

### Examples
```
feat: add voice recognition support
fix: resolve memory leak in speech synthesis
refactor: simplify mcp handler logic
docs: update installation instructions
test: add unit tests for utterance queue
chore: upgrade dependencies
```

### Valid Types
- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation changes
- `style`: formatting, missing semicolons, etc
- `refactor`: code restructuring without changing behavior
- `test`: adding or updating tests
- `chore`: maintenance tasks, dependencies, build config
- `perf`: performance improvements
- `ci`: CI/CD changes

## Common Development Commands

### Building
```bash
npm run build              # Build both client and server
npm run build:client       # Build client only (Vite)
npm run build:server       # Build server only (tsup)
```

### Development
```bash
npm run dev                # Run client dev server + server with tsx
npm run dev:client         # Run Vite dev server only
npm run dev:debug          # Run with DEBUG=true flag
```

### MCP Mode
```bash
npm run mcp                # Run server in MCP-managed mode
npm run mcp:debug          # Run MCP mode with DEBUG=true
```

### Testing
```bash
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
```

### Installation & Hooks
```bash
npx mcp-voice-hooks install-hooks    # Install/update hooks
npx mcp-voice-hooks uninstall        # Uninstall hooks and settings
```

## Architecture Overview

### Unified Server Architecture

The project uses a **unified server** pattern that combines:
- HTTP server (Express) for browser client communication
- MCP server (Model Context Protocol) for Claude Code integration
- Shared state management (UtteranceQueue, VoicePreferences)

**Key files:**
- [src/server/unified-server.ts](src/server/unified-server.ts) - Main entry point, initializes both servers
- [src/server/http-endpoints.ts](src/server/http-endpoints.ts) - HTTP API endpoints
- [src/server/mcp-handler.ts](src/server/mcp-handler.ts) - MCP tools and handlers
- [src/server/utterance-queue.ts](src/server/utterance-queue.ts) - Shared utterance state

### Client-Server Communication

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser UI    │    │ Unified Server  │    │  Claude Code    │
│                 │    │                 │    │                 │
│ • Voice Input   │◄──►│ • HTTP Server   │    │ • MCP Client    │
│ • TTS Output    │    │ • Shared Queue  │◄──►│ • Tool Calls    │
│ • Status View   │    │ • Hook APIs     │    │ • Hooks         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Utterance State Machine

Utterances flow through three states:
1. **pending** - User spoke, not yet seen by Claude
2. **delivered** - Claude received via dequeue_utterances
3. **responded** - Claude spoke back (via speak tool)

### Build System

- **Client**: Vite builds TypeScript/Tailwind to `dist/client/`
- **Server**: tsup builds TypeScript to `dist/server/`
- **Aliases**: `@shared`, `@client`, `@server` for clean imports

### Hook System

The project uses Claude Code hooks to enforce conversation flow:
- **Stop hook**: Prevents stopping until Claude waits for/processes voice input
- **Pre-speak hook**: Ensures pending utterances are processed before speaking

Hooks are configured in `.claude/settings.local.json` and managed by [src/server/hook-merger.ts](src/server/hook-merger.ts)

### Auto-Delivery Mode

By default, `MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT=true`:
- `dequeue_utterances` and `wait_for_utterance` tools are hidden
- Hooks automatically deliver voice input before tool use/speaking
- Simplifies interaction (Claude doesn't need to call tools explicitly)

Set to `false` to expose tools and require manual calls.

## Development Notes

### After TypeScript Changes
You **must** rebuild server code after modifying TypeScript files:
```bash
npm run build:server
```
Then restart Claude Code to use updated code.

### Browser File Changes
Changes to browser files (`public/*`, `src/client/*`) are picked up by Vite dev server automatically during development, but require `npm run build:client` for production builds.

### Port Configuration
Default port is 5111. Configure via environment variable:
```bash
export MCP_VOICE_HOOKS_PORT=8080
```

### Running Tests
Tests use Jest with ts-jest. All test files are in `src/server/__tests__/`.

Pre-commit hooks automatically run tests, knip (unused exports), and ts-prune (unused code).
