#!/usr/bin/env bun

import { main } from "../src/grok-to-markdown.ts";

process.exitCode = await main();
