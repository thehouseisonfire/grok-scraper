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

- [Bun](https://bun.sh)
- [Playwright Chromium](https://playwright.dev)

## Setup

```bash
bun install
bunx playwright install chromium
```

## Install

```bash
bun add -g grok-scraper
# or run without installing
bunx grok-scraper "https://grok.com/share/..."
```

As a library:

```bash
bunx jsr add @thehouseisonfire/grok-scraper
```

```ts
import { scrapeConversation } from "@thehouseisonfire/grok-scraper";
```

## Usage

```bash
grok-scraper "https://grok.com/share/..."
```

From a source checkout, `bun run scrape` works the same way.

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

Compile to JavaScript for use without bun:

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
