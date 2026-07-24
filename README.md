# Grok Conversation Scraper

A robust Python script to extract shared conversation threads from Grok (xAI) URLs and convert them into clean, formatted Markdown files.

## Features

- **Full Conversation Extraction**: Captures both User prompts and Grok responses.
- **Dynamic Content Handling**: Uses Playwright to render JavaScript-heavy content.
- **Markdown Conversion**: Preserves code blocks, lists, links, and text formatting.
- **Metadata**: Includes conversation title, source URL, and extraction date.
- **Smart Formatting**: Removes UI clutter (buttons like "Copy", "Regenerate").

## Prerequisites

- Python 3.8+
- [Playwright](https://playwright.dev/python/)

## Installation

1. **Clone or download this repository.**
2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Install Playwright browsers:**
   ```bash
   playwright install chromium
   ```

## Usage

Run the script from the command line, providing the Grok share URL:

```bash
python grok_scraper.py "https://grok.com/share/YOUR_CONVERSATION_ID"
```

### Options

- `-o`, `--output`: Specify a custom output filename (e.g., `my_chat.md`).

```bash
python grok_scraper.py "https://grok.com/share/..." -o analysis_results.md
```

## Output Format

The script generates a Markdown file with the following structure:

```markdown
# [Conversation Title]

**Source**: https://grok.com/share/...
**Date**: YYYY-MM-DD

---

## User
[User's Message]

## Grok
[Grok's Response]
...
```

## Troubleshooting

- **Headless Mode**: The script runs in headless mode by default. If you suspect bot detection or issues, you can modify `headless=True` to `headless=False` in `grok_scraper.py` to watch the extraction process.
- **Timeout/Empty File**: If the script fails to find messages, it will try to dump the page content. Ensure your internet connection is stable as Grok is a dynamic SPA.
