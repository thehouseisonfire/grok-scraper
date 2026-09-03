import { describe, expect, test } from "bun:test";

// This test verifies basic library functionality works at runtime
// It exercises the exported API without requiring actual browser/scraping

import {
  cleanFilename,
  cleanMarkdown,
  cleanTitle,
  DEFAULT_TITLE,
  DEFAULT_TIMEOUT_MS,
  MESSAGE_SELECTORS,
  TITLE_SUFFIX,
  UI_NOISE,
  UsageError,
  errorMessage,
  parsePositiveInteger,
  parseUrl,
  configureTurndown,
  convertTurns,
  formatDocument,
  type Metadata,
  type RawTurn,
  type Message,
  type Role,
  type CliOptions,
  type ScrapeResult,
} from "./index.ts";

describe("Runtime smoke test", () => {
  test("all exports are available", () => {
    // Constants
    expect(typeof DEFAULT_TIMEOUT_MS).toBe("number");
    expect(typeof DEFAULT_TITLE).toBe("string");
    expect(Array.isArray(MESSAGE_SELECTORS)).toBe(true);
    expect(TITLE_SUFFIX instanceof RegExp).toBe(true);
    expect(UI_NOISE instanceof Set).toBe(true);

    // Error classes
    expect(typeof UsageError).toBe("function");

    // Functions
    expect(typeof cleanFilename).toBe("function");
    expect(typeof cleanMarkdown).toBe("function");
    expect(typeof cleanTitle).toBe("function");
    expect(typeof errorMessage).toBe("function");
    expect(typeof parsePositiveInteger).toBe("function");
    expect(typeof parseUrl).toBe("function");
    expect(typeof configureTurndown).toBe("function");
    expect(typeof convertTurns).toBe("function");
    expect(typeof formatDocument).toBe("function");
  });

  test("types are properly exported", () => {
    // Type exports are checked at compile time, but we can verify
    // the values are available at runtime by using them in type annotations
    const role: Role = "User";
    const metadata: Metadata = { title: "Test", url: "https://test.com" };
    const rawTurn: RawTurn = { role: null, html: "<p>test</p>" };
    const message: Message = { role: "User", content: "test" };
    const cliOptions: CliOptions = {
      url: new URL("https://test.com"),
      timeoutMs: 60000,
      headed: false,
    };
    const scrapeResult: ScrapeResult = {
      outputPath: "/test.md",
      messageCount: 1,
      selector: ".test",
    };

    expect(role).toBe("User");
    expect(metadata.title).toBe("Test");
    expect(rawTurn.html).toBe("<p>test</p>");
    expect(message.content).toBe("test");
    expect(cliOptions.timeoutMs).toBe(60000);
    expect(scrapeResult.messageCount).toBe(1);
  });

  test("library functions work correctly", () => {
    expect(cleanTitle("Test | Shared Grok Conversation")).toBe("Test");
    expect(cleanFilename("Test File")).toBe("Test_File");
    expect(parsePositiveInteger("42", "--timeout")).toBe(42);
    expect(parseUrl("https://grok.com/test").protocol).toBe("https:");
    expect(errorMessage(new Error("test"))).toBe("test");
  });

  test("Turndown configuration works", () => {
    const converter = configureTurndown();
    expect(typeof converter.turndown).toBe("function");
    const result = converter.turndown("<p>Hello</p>");
    expect(result).toContain("Hello");
  });

  test("convertTurns works", () => {
    const converter = configureTurndown();
    const rawTurns: RawTurn[] = [
      { role: "User", html: "<p>Hello</p>" },
      { role: "Grok", html: "<p>Hi there</p>" },
    ];
    const messages = convertTurns(rawTurns, converter);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("User");
    expect(messages[0]?.content).toContain("Hello");
    expect(messages[1]?.role).toBe("Grok");
    expect(messages[1]?.content).toContain("Hi there");
  });

  test("formatDocument works", () => {
    const metadata: Metadata = {
      title: "Test Conversation",
      url: "https://grok.com/test",
    };
    const messages: Message[] = [
      { role: "User", content: "Hello" },
      { role: "Grok", content: "Hi there" },
    ];
    const result = formatDocument(metadata, messages);
    expect(result).toContain("# Test Conversation");
    expect(result).toContain("https://grok.com/test");
    expect(result).toContain("## User");
    expect(result).toContain("Hello");
    expect(result).toContain("## Grok");
    expect(result).toContain("Hi there");
  });
});
