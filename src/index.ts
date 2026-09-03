/**
 * Grok Conversation Scraper
 *
 * Scrape Grok conversations from grok.com and save them as clean Markdown.
 *
 * @example
 * ```ts
 * import { scrapeConversation, parseUrl } from "@thehouseisonfire/grok-scraper";
 *
 * const result = await scrapeConversation({
 *   url: parseUrl("https://grok.com/share/abc123"),
 * });
 * console.log(`Saved ${result.messageCount} messages to ${result.outputPath}`);
 * ```
 */

// Constants
export {
  /** Default timeout for navigation and content loading (60,000ms). */
  DEFAULT_TIMEOUT_MS,
  /** Current package version. */
  VERSION,
  /** CSS selectors for detecting Grok message elements. */
  MESSAGE_SELECTORS,
} from "./grok-to-markdown.ts";
export {
  /** Default title used when no conversation title is detected. */
  DEFAULT_TITLE,
  /** Regex pattern for Grok branding suffixes to strip from conversation titles. */
  TITLE_SUFFIX,
  /** Set of UI button/label text to filter out from Markdown content. */
  UI_NOISE,
} from "./helpers.ts";

// Error types
export {
  /** Error thrown when conversation content cannot be extracted. */
  ExtractionError,
} from "./grok-to-markdown.ts";
export {
  /** Error thrown for invalid command-line usage or input. */
  UsageError,
} from "./helpers.ts";

// String utilities
export {
  /** Converts a conversation title into a safe filename. */
  cleanFilename,
  /** Cleans Markdown content by removing UI noise. */
  cleanMarkdown,
  /** Cleans a conversation title by removing Grok branding suffixes. */
  cleanTitle,
  /** Converts an unknown error value to a string message. */
  errorMessage,
} from "./helpers.ts";

// Conversion utilities
export {
  /** Creates and configures a TurndownService for HTML-to-Markdown conversion. */
  configureTurndown,
  /** Converts raw HTML turns into Markdown messages with role inference. */
  convertTurns,
  /** Formats a complete conversation as a Markdown document with metadata header. */
  formatDocument,
} from "./grok-to-markdown.ts";

// CLI utilities
export {
  /** Main entry point for the CLI. Returns exit code (0 for success, non-zero for errors). */
  main,
  /** Parses command-line arguments into structured options. */
  parseCliOptions,
  /** Prints the command-line help text to stdout. */
  printHelp,
} from "./grok-to-markdown.ts";
export {
  /** Parses a string as a positive integer. */
  parsePositiveInteger,
  /** Parses and validates a Grok conversation URL. */
  parseUrl,
} from "./helpers.ts";

// Main scraping function
export {
  /** Scrapes a Grok conversation and saves it as a Markdown file. */
  scrapeConversation,
} from "./grok-to-markdown.ts";

// Types
export type {
  /** Metadata about a scraped Grok conversation. */
  Metadata,
  /** A raw turn extracted from the DOM before conversion to Markdown. */
  RawTurn,
  /** A message in a Grok conversation with converted Markdown content. */
  Message,
  /** Command-line options for scraping a Grok conversation. */
  CliOptions,
  /** The result of scraping a Grok conversation. */
  ScrapeResult,
} from "./grok-to-markdown.ts";
export type {
  /** The role of a message author in a Grok conversation. */
  Role,
} from "./helpers.ts";
