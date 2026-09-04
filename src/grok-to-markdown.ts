import process from "node:process";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { chromium, errors as playwrightErrors, type Browser, type Page } from "playwright";
import TurndownService from "turndown";
import turndownPluginGfm from "turndown-plugin-gfm";

import {
  cleanFilename,
  cleanMarkdown,
  cleanTitle,
  errorMessage,
  parsePositiveInteger,
  parseUrl,
  type Role,
  UsageError,
} from "./helpers.ts";

/** Metadata about a scraped Grok conversation. */
export interface Metadata {
  title: string;
  url: string;
}

/** A raw turn extracted from the DOM before conversion to Markdown. */
export interface RawTurn {
  role: Role | null;
  html: string;
}

/** A message in a Grok conversation with converted Markdown content. */
export interface Message {
  role: Role;
  content: string;
}

/** Command-line options for scraping a Grok conversation. */
export interface CliOptions {
  url: URL;
  output?: string;
  debugHtml?: string;
  selector?: string;
  timeoutMs: number;
  headed: boolean;
}

/** The result of scraping a Grok conversation. */
export interface ScrapeResult {
  outputPath: string;
  messageCount: number;
  selector: string;
}

/** Current package version. */
export const VERSION = "1.0.2";

/** Default timeout for navigation and content loading (60,000ms). */
export const DEFAULT_TIMEOUT_MS = 60_000;

const SIGINT_EXIT_CODE = 130;

let interrupted = false;
let activeBrowser: Browser | undefined;

function registerSigintHandler(): void {
  const onSigint = (): void => {
    if (interrupted) {
      process.exit(SIGINT_EXIT_CODE);
    }

    interrupted = true;
    console.error("\n[!] Interrupted. Closing the browser (Ctrl+C again to force quit)...");

    const shutdown =
      activeBrowser !== undefined
        ? activeBrowser.close().catch(() => undefined)
        : Promise.resolve();

    void shutdown.then(() => process.exit(SIGINT_EXIT_CODE));
  };

  process.on("SIGINT", onSigint);
}

/**
 * CSS selectors for detecting Grok message elements.
 *
 * Ordered from relatively semantic/specific selectors to broader fallbacks.
 * The scraper chooses the first selector which produces at least two
 * non-empty candidate elements after the page has rendered.
 */
export const MESSAGE_SELECTORS = [
  "[data-message-author-role]",
  '[data-testid*="message-content" i]',
  '[data-testid*="message" i] .prose',
  '[id^="message-"] .prose',
  '[id^="message-"]',
  "main article",
  "main .prose",
  "article .prose",
  'main [class*="message" i]',
] as const;

/** Error thrown when conversation content cannot be extracted. */
export class ExtractionError extends Error {
  override readonly name = "ExtractionError";
}

/** Prints the command-line help text to stdout. */
export function printHelp(): void {
  console.log(
    `
Usage:
  grok-scraper [options] <url>

Scrape a shared Grok conversation and save it as Markdown.

Options:
  -o, --output <path>       Output Markdown file
      --selector <css>      Override automatic message detection
      --timeout <ms>        Navigation/content timeout
                            Default: ${DEFAULT_TIMEOUT_MS}
      --debug-html <path>   Save the rendered page HTML for debugging
      --headed              Show the Chromium window
  -v, --version             Print the version
  -h, --help                Show this help

Examples:
  grok-scraper "https://grok.com/share/..."
  grok-scraper -o conversation.md "https://grok.com/share/..."
  grok-scraper --headed --debug-html page.html "https://..."
`.trim(),
  );
}

/** Parses command-line arguments into structured options. */
export function parseCliOptions(argv: readonly string[]): CliOptions {
  const cliOptions = {
    output: {
      type: "string",
      short: "o",
    },
    selector: {
      type: "string",
    },
    timeout: {
      type: "string",
      default: String(DEFAULT_TIMEOUT_MS),
    },
    "debug-html": {
      type: "string",
    },
    headed: {
      type: "boolean",
      default: false,
    },
    version: {
      type: "boolean",
      short: "v",
      default: false,
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    },
  } as const;

  const { values, positionals } = parseArgs({
    args: [...argv],
    options: cliOptions,
    allowPositionals: true,
    strict: true,
  });

  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (positionals.length === 0) {
    throw new UsageError("A Grok share URL is required.");
  }

  if (positionals.length > 1) {
    throw new UsageError(
      `Expected one URL, but received ${positionals.length} positional arguments.`,
    );
  }

  const urlArgument = positionals[0];

  if (urlArgument === undefined) {
    throw new UsageError("A Grok share URL is required.");
  }

  return {
    url: parseUrl(urlArgument),
    timeoutMs: parsePositiveInteger(values.timeout, "--timeout"),
    headed: values.headed,
    ...(values.output !== undefined ? { output: values.output } : {}),
    ...(values.selector !== undefined ? { selector: values.selector } : {}),
    ...(values["debug-html"] !== undefined ? { debugHtml: values["debug-html"] } : {}),
  };
}

/** Creates and configures a TurndownService for HTML-to-Markdown conversion. */
export function configureTurndown(): TurndownService {
  const converter = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  converter.use(turndownPluginGfm.gfm);

  converter.remove(["script", "style", "noscript", "svg", "canvas"] as unknown as Parameters<
    TurndownService["remove"]
  >[0]);

  converter.addRule("unwrap-buttons", {
    filter: "button",
    replacement(content) {
      return content;
    },
  });

  converter.addRule("fenced-code-with-language", {
    filter(node) {
      return node.nodeName === "PRE" && node.firstElementChild?.nodeName === "CODE";
    },

    replacement(_content, node) {
      const codeElement = node.firstElementChild;

      if (!(codeElement instanceof HTMLElement)) {
        return "";
      }

      const code = codeElement.textContent?.replace(/\n$/, "") ?? "";
      const className = codeElement.getAttribute("class") ?? "";

      const language = className.match(/(?:^|\s)(?:language-|lang-)([\w#+.-]+)/i)?.[1] ?? "";

      const longestBacktickSequence = Math.max(
        0,
        ...(code.match(/`+/g)?.map((value) => value.length) ?? []),
      );

      const fence = "`".repeat(Math.max(3, longestBacktickSequence + 1));

      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    },
  });

  return converter;
}

async function navigate(page: Page, url: URL, timeoutMs: number): Promise<void> {
  console.log(`[-] Navigating to ${url.href}`);

  try {
    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    if (response !== null && !response.ok()) {
      throw new Error(`The server returned HTTP ${response.status()} ${response.statusText()}.`);
    }
  } catch (error) {
    if (error instanceof playwrightErrors.TimeoutError) {
      console.warn(
        `[!] Navigation exceeded ${timeoutMs} ms; attempting to use the DOM already loaded.`,
      );
      return;
    }

    throw new Error(`Navigation failed: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

async function waitForConversationContent(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
): Promise<void> {
  console.log("[-] Waiting for conversation content");

  const combinedSelector = selectors.join(", ");

  try {
    await page.locator(combinedSelector).first().waitFor({
      state: "attached",
      timeout: timeoutMs,
    });
  } catch (error) {
    throw new ExtractionError(`No conversation-like elements appeared within ${timeoutMs} ms.`, {
      cause: error,
    });
  }
}

async function renderLazyContent(page: Page): Promise<void> {
  console.log("[-] Rendering lazy-loaded content");

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });

  let previousHeight = -1;
  let stablePasses = 0;

  for (let pass = 0; pass < 40; pass += 1) {
    const currentHeight = await page.evaluate(
      () =>
        document.scrollingElement?.scrollHeight ??
        document.documentElement.scrollHeight ??
        document.body.scrollHeight,
    );

    await page.evaluate(() => {
      window.scrollTo(
        0,
        document.scrollingElement?.scrollHeight ??
          document.documentElement.scrollHeight ??
          document.body.scrollHeight,
      );
    });

    await page.waitForTimeout(400);

    const nextHeight = await page.evaluate(
      () =>
        document.scrollingElement?.scrollHeight ??
        document.documentElement.scrollHeight ??
        document.body.scrollHeight,
    );

    if (currentHeight === previousHeight && nextHeight === currentHeight) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
    }

    if (stablePasses >= 3) {
      break;
    }

    previousHeight = nextHeight;
  }
}

async function countUsableElements(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((elements) => {
    const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

    return elements.filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);

      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      return normalize(element.innerText).length > 0;
    }).length;
  });
}

async function chooseMessageSelector(
  page: Page,
  selectors: readonly string[],
  customSelector: boolean,
): Promise<string> {
  if (customSelector) {
    const selector = selectors[0];

    if (selector === undefined) {
      throw new ExtractionError("The custom selector is empty.");
    }

    const count = await countUsableElements(page, selector);

    if (count === 0) {
      throw new ExtractionError(
        `The custom selector ${JSON.stringify(selector)} matched no usable elements.`,
      );
    }

    return selector;
  }

  let best:
    | {
        selector: string;
        count: number;
      }
    | undefined;

  for (const selector of selectors) {
    const count = await countUsableElements(page, selector);

    if (count >= 2) {
      return selector;
    }

    if (count > (best?.count ?? 0)) {
      best = { selector, count };
    }
  }

  if (best !== undefined && best.count > 0) {
    console.warn(`[!] Only one candidate turn was found with ${best.selector}.`);
    return best.selector;
  }

  throw new ExtractionError("Could not identify any usable conversation turns.");
}

async function extractMetadata(page: Page): Promise<Metadata> {
  const metadata = await page.evaluate(() => {
    const meta = (property: string): string | undefined =>
      document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.content.trim() ||
      undefined;

    const canonicalUrl =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href.trim() || undefined;

    return {
      title: meta("og:title") ?? document.title,
      url: meta("og:url") ?? canonicalUrl ?? window.location.href,
    };
  });

  return {
    title: cleanTitle(metadata.title),
    url: metadata.url,
  };
}

async function extractRawTurns(page: Page, selector: string): Promise<RawTurn[]> {
  return page.locator(selector).evaluateAll((elements) => {
    type BrowserRole = "User" | "Grok";

    const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

    const inferRole = (element: HTMLElement): BrowserRole | null => {
      let current: HTMLElement | null = element;

      for (let depth = 0; current !== null && depth < 5; depth += 1) {
        const explicitRole = (
          current.getAttribute("data-message-author-role") ??
          current.getAttribute("data-author") ??
          current.getAttribute("data-role") ??
          ""
        )
          .trim()
          .toLowerCase();

        if (explicitRole === "user" || explicitRole === "human") {
          return "User";
        }

        if (explicitRole === "assistant" || explicitRole === "model" || explicitRole === "grok") {
          return "Grok";
        }

        const structuralSignal = [
          current.id,
          current.className,
          current.getAttribute("aria-label") ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (
          /(?:user|human)[-_ ]*(?:message|turn|prompt)|(?:message|turn)[-_ ]*(?:user|human)/.test(
            structuralSignal,
          )
        ) {
          return "User";
        }

        if (
          /(?:assistant|grok|model)[-_ ]*(?:message|turn|response)|(?:message|turn)[-_ ]*(?:assistant|grok|model)/.test(
            structuralSignal,
          )
        ) {
          return "Grok";
        }

        current = current.parentElement;
      }

      const firstLine =
        element.innerText
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) ?? "";

      if (/^(?:user|you)\s*:?\s*$/i.test(firstLine)) {
        return "User";
      }

      if (/^(?:grok|assistant)\s*:?\s*$/i.test(firstLine)) {
        return "Grok";
      }

      return null;
    };

    const candidates = elements.filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        normalize(element.innerText).length > 0
      );
    });

    const pruned = candidates.filter((candidate) => {
      const candidateText = normalize(candidate.innerText);

      return !candidates.some(
        (other) =>
          other !== candidate &&
          candidate.contains(other) &&
          normalize(other.innerText) === candidateText,
      );
    });

    return pruned.map((element) => {
      const clone = element.cloneNode(true) as HTMLElement;

      clone
        .querySelectorAll(
          ["script", "style", "noscript", "svg", "canvas", '[aria-hidden="true"]'].join(", "),
        )
        .forEach((node) => node.remove());

      return {
        role: inferRole(element),
        html: clone.outerHTML,
      };
    });
  });
}

/** Converts raw HTML turns into Markdown messages with role inference. */
export function convertTurns(rawTurns: RawTurn[], converter: TurndownService): Message[] {
  const messages: Message[] = [];
  let expectedRole: Role = "User";

  for (const turn of rawTurns) {
    const currentRole: Role = turn.role ?? expectedRole;
    const markdown = cleanMarkdown(converter.turndown(turn.html), currentRole);

    if (markdown.length === 0) {
      continue;
    }

    const previous = messages.at(-1);

    if (previous !== undefined && previous.role === currentRole && turn.role !== null) {
      previous.content = `${previous.content}\n\n${markdown}`;
    } else {
      messages.push({
        role: currentRole,
        content: markdown,
      });
    }

    expectedRole = currentRole === "User" ? "Grok" : "User";
  }

  return messages;
}

/** Formats a complete conversation as a Markdown document with metadata header. */
export function formatDocument(metadata: Metadata, messages: Message[]): string {
  const date = new Date().toISOString().slice(0, 10);

  const sections = [
    `# ${metadata.title}`,
    "",
    `**Source:** <${metadata.url}>`,
    `**Scraped:** ${date}`,
    "",
    "---",
    "",
  ];

  for (const message of messages) {
    sections.push(`## ${message.role}`, "", message.content, "");
  }

  return `${sections.join("\n").trimEnd()}\n`;
}

async function writeTextFileAtomic(path: string, content: string): Promise<string> {
  const absolutePath = resolve(path);
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;

  await mkdir(dirname(absolutePath), {
    recursive: true,
  });

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return absolutePath;
}

async function saveDebugHtml(page: Page, path: string): Promise<void> {
  const outputPath = await writeTextFileAtomic(path, await page.content());

  console.log(`[+] Rendered HTML saved to ${outputPath}`);
}

/** Scrapes a Grok conversation and saves it as a Markdown file. */
export async function scrapeConversation(options: CliOptions): Promise<ScrapeResult> {
  console.log(`[-] Launching Chromium in ${options.headed ? "headed" : "headless"} mode`);

  const browser = await chromium.launch({
    headless: !options.headed,
  });

  activeBrowser = browser;

  const context = await browser.newContext({
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  await context.route("**/*", async (route) => {
    const resourceType = route.request().resourceType();

    if (resourceType === "font" || resourceType === "media" || resourceType === "image") {
      await route.abort();
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);

  const selectors = options.selector !== undefined ? [options.selector] : MESSAGE_SELECTORS;

  try {
    await navigate(page, options.url, options.timeoutMs);

    await waitForConversationContent(page, selectors, options.timeoutMs);

    await renderLazyContent(page);

    if (options.debugHtml !== undefined) {
      await saveDebugHtml(page, options.debugHtml);
    }

    const selector = await chooseMessageSelector(page, selectors, options.selector !== undefined);

    console.log(`[-] Extracting turns with selector: ${selector}`);

    const [metadata, rawTurns] = await Promise.all([
      extractMetadata(page),
      extractRawTurns(page, selector),
    ]);

    console.log(`[-] Detected title: ${metadata.title}`);
    console.log(`[-] Found ${rawTurns.length} raw turn blocks`);

    const messages = convertTurns(rawTurns, configureTurndown());

    if (messages.length === 0) {
      throw new ExtractionError(
        [
          "The page loaded, but no messages could be converted.",
          "Use --debug-html to inspect the rendered DOM or",
          "--selector to provide a message-container selector.",
        ].join(" "),
      );
    }

    const outputPath = options.output ?? `${cleanFilename(metadata.title)}.md`;

    const absoluteOutputPath = await writeTextFileAtomic(
      outputPath,
      formatDocument(metadata, messages),
    );

    return {
      outputPath: absoluteOutputPath,
      messageCount: messages.length,
      selector,
    };
  } catch (error) {
    if (options.debugHtml !== undefined) {
      await saveDebugHtml(page, options.debugHtml).catch((debugError: unknown) => {
        console.warn(`[!] Could not save debug HTML: ${errorMessage(debugError)}`);
      });
    }

    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

/** Main entry point for the CLI. Returns exit code (0 for success, non-zero for errors). */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  registerSigintHandler();

  try {
    const options = parseCliOptions(argv);
    const result = await scrapeConversation(options);

    console.log(`[+] Saved ${result.messageCount} messages to ${result.outputPath}`);
    return 0;
  } catch (error: unknown) {
    if (interrupted) {
      return SIGINT_EXIT_CODE;
    }

    if (error instanceof UsageError) {
      console.error(`[!] ${error.message}\n`);
      printHelp();
    } else {
      console.error(`[!] ${errorMessage(error)}`);

      if (error instanceof Error && error.cause !== undefined) {
        console.error(`    Caused by: ${errorMessage(error.cause)}`);
      }
    }

    return 1;
  }
}

const isMainModule =
  (import.meta as ImportMeta & { main?: boolean }).main === true ||
  (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (isMainModule) {
  process.exitCode = await main();
}
