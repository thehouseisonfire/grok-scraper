import assert from "node:assert/strict";
import { describe, test } from "node:test";

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
    assert.equal(typeof DEFAULT_TIMEOUT_MS, "number");
    assert.equal(typeof DEFAULT_TITLE, "string");
    assert.equal(Array.isArray(MESSAGE_SELECTORS), true);
    assert.equal(TITLE_SUFFIX instanceof RegExp, true);
    assert.equal(UI_NOISE instanceof Set, true);

    // Error classes
    assert.equal(typeof UsageError, "function");

    // Functions
    assert.equal(typeof cleanFilename, "function");
    assert.equal(typeof cleanMarkdown, "function");
    assert.equal(typeof cleanTitle, "function");
    assert.equal(typeof errorMessage, "function");
    assert.equal(typeof parsePositiveInteger, "function");
    assert.equal(typeof parseUrl, "function");
    assert.equal(typeof configureTurndown, "function");
    assert.equal(typeof convertTurns, "function");
    assert.equal(typeof formatDocument, "function");
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

    assert.equal(role, "User");
    assert.equal(metadata.title, "Test");
    assert.equal(rawTurn.html, "<p>test</p>");
    assert.equal(message.content, "test");
    assert.equal(cliOptions.timeoutMs, 60000);
    assert.equal(scrapeResult.messageCount, 1);
  });

  test("library functions work correctly", () => {
    assert.equal(cleanTitle("Test | Shared Grok Conversation"), "Test");
    assert.equal(cleanFilename("Test File"), "Test_File");
    assert.equal(parsePositiveInteger("42", "--timeout"), 42);
    assert.equal(parseUrl("https://grok.com/test").protocol, "https:");
    assert.equal(errorMessage(new Error("test")), "test");
  });

  test("Turndown configuration works", () => {
    const converter = configureTurndown();
    assert.equal(typeof converter.turndown, "function");
    const result = converter.turndown("<p>Hello</p>");
    assert.match(result, /Hello/);
  });

  test("convertTurns works", () => {
    const converter = configureTurndown();
    const rawTurns: RawTurn[] = [
      { role: "User", html: "<p>Hello</p>" },
      { role: "Grok", html: "<p>Hi there</p>" },
    ];
    const messages = convertTurns(rawTurns, converter);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "User");
    assert.match(messages[0]?.content ?? "", /Hello/);
    assert.equal(messages[1]?.role, "Grok");
    assert.match(messages[1]?.content ?? "", /Hi there/);
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
    assert.match(result, /# Test Conversation/);
    assert.match(result, /https:\/\/grok\.com\/test/);
    assert.match(result, /## User/);
    assert.match(result, /Hello/);
    assert.match(result, /## Grok/);
    assert.match(result, /Hi there/);
  });
});
