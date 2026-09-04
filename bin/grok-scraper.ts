#!/usr/bin/env bun

import process from "node:process";
import { main } from "../src/grok-to-markdown.ts";

process.exitCode = await main();
