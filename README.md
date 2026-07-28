# Grok Conversation Scraper

Scrape shared Grok conversations and save them as clean Markdown.

## Features

- Locator-based auto-waiting (no brittle `sleep` calls)
- Bounded lazy-loading with stability detection
- Automatic selector discovery with fallback chain
- Role inference from DOM attributes, structure, and text heuristics
- Atomic file writes (temp + rename)
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

## Usage

```bash
bun run scrape "https://grok.com/share/..."
```

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
bun run scrape "https://grok.com/share/..."

# Custom output file
bun run scrape -o conversation.md "https://grok.com/share/..."

# Debug mode with visible browser
bun run scrape --headed --debug-html page.html "https://grok.com/share/..."

# Custom selector when Grok changes its DOM
bun run scrape --selector 'main .some-message-selector' "https://grok.com/share/..."
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
