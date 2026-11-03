#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HttpVerdictSource } from "./api.js";
import { createServer } from "./server.js";

const server = createServer({ source: new HttpVerdictSource(process.env.TMW_API_URL) });
await server.connect(new StdioServerTransport());
