# Grok Conversation Scraper

Scrape shared Grok conversations and save them as clean Markdown.

## Features

- Locator-based auto-waiting (no brittle `sleep` calls)
- Bounded lazy-loading with stability detection
- Automatic selector discovery with fallback chain
- Role inference from DOM attributes, structure, and text heuristics
- Atomic file writes (temp + rename)
- Graceful Ctrl+C shutdown (press again to force quit)
- Non-zero exit codes on failure with optional `--debug-html` capture
- GFM support (tables, strikethrough, task lists)

## Prerequisites

- One of [Bun](https://bun.sh), [Deno](https://deno.com), or [Node.js](https://nodejs.org)
- [Playwright Chromium](https://playwright.dev)

## Setup

### Bun

```bash
bun install
bunx playwright install chromium
```

### Deno

```bash
deno run -A npm:playwright install chromium
```

### Node.js

```bash
npm install
npx playwright install chromium
```

## Install

```bash
# Bun
bun add -g grok-scraper
# or run without installing
bunx grok-scraper "https://grok.com/share/..."
```

As a library:

```ts
import { scrapeConversation } from "@thehouseisonfire/grok-scraper";
```

Install via [`jsr`](https://jsr.io) from any runtime:

```bash
# Deno
deno add @thehouseisonfire/grok-scraper
# Bun
bunx jsr add @thehouseisonfire/grok-scraper
```

## Testing

The test suite uses `node:test`, so it runs on any runtime:

```bash
bun test
deno test -A
node --test
```

## Usage

```bash
# Bun
grok-scraper "https://grok.com/share/..."

# Deno (from a source checkout)
deno run -A bin/grok-scraper.ts "https://grok.com/share/..."

# Node.js (after building)
node dist/grok-to-markdown.js "https://grok.com/share/..."
```

From a source checkout, `bun run scrape` and `deno task scrape` work the same way.

### Options

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output Markdown file |
| `--selector <css>` | Override automatic message detection |
| `--timeout <ms>` | Navigation/content timeout (default: 60000) |
| `--debug-html <path>` | Save rendered page HTML for debugging |
| `--headed` | Show the Chromium window |

### Examples

```bash
# Basic usage
grok-scraper "https://grok.com/share/..."

# Custom output file
grok-scraper -o conversation.md "https://grok.com/share/..."

# Debug mode with visible browser
grok-scraper --headed --debug-html page.html "https://grok.com/share/..."

# Custom selector when Grok changes its DOM
grok-scraper --selector 'main .some-message-selector' "https://grok.com/share/..."
```

## Build (optional)

Compile to JavaScript for use without a TypeScript runner (e.g. plain Node.js):

```bash
bun run build
node dist/grok-to-markdown.js "https://grok.com/share/..."
```

## Output Format

```markdown
# [Conversation Title]

**Source:** <https://grok.com/share/...>
**Scraped:** YYYY-MM-DD

---

## User
[User's message]

## Grok
[Grok's response]
```

## License

Dual-licensed under either of:

- [MIT](LICENSE-MIT)
- [Apache License, Version 2.0](LICENSE-APACHE)

at your option.
