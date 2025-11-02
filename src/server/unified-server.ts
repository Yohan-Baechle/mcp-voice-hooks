#!/usr/bin/env node

import express from "express";
import type { Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { debugLog } from "./debug.ts";
import { UtteranceQueue } from "./utterance-queue.ts";
import { VoicePreferences } from "./voice-processor.ts";
import { setupHttpEndpoints } from "./http-endpoints.ts";
import { setupMCPServer } from "./mcp-handler.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTP_PORT = process.env.MCP_VOICE_HOOKS_PORT
  ? parseInt(process.env.MCP_VOICE_HOOKS_PORT)
  : 5111;
const AUTO_DELIVER_VOICE_INPUT =
  process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";

const IS_MCP_MANAGED = process.argv.includes("--mcp-managed");
const queue = new UtteranceQueue();
const lastToolUseTimestamp = { current: null as Date | null };
const lastSpeakTimestamp = { current: null as Date | null };
const voicePreferences: VoicePreferences = {
  voiceResponsesEnabled: true,
  voiceInputActive: false,
};
const ttsClients = new Set<Response>();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client")));

setupHttpEndpoints(
  app,
  queue,
  voicePreferences,
  ttsClients,
  lastToolUseTimestamp,
  lastSpeakTimestamp,
  __dirname
);

app.listen(HTTP_PORT, async () => {
  if (!IS_MCP_MANAGED) {
    console.log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.log(
      `[Mode] Running in ${IS_MCP_MANAGED ? "MCP-managed" : "standalone"} mode`
    );
    console.log(
      `[Auto-deliver] Voice input auto-delivery is ${
        AUTO_DELIVER_VOICE_INPUT
          ? "enabled (tools hidden)"
          : "disabled (tools shown)"
      }`
    );
  } else {
    console.error(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.error(`[Mode] Running in MCP-managed mode`);
    console.error(
      `[Auto-deliver] Voice input auto-delivery is ${
        AUTO_DELIVER_VOICE_INPUT
          ? "enabled (tools hidden)"
          : "disabled (tools shown)"
      }`
    );
  }

  const autoOpenBrowser =
    process.env.MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER !== "false";
  if (IS_MCP_MANAGED && autoOpenBrowser) {
    setTimeout(async () => {
      if (ttsClients.size === 0) {
        debugLog("[Browser] No frontend connected, opening browser...");
        try {
          const open = (await import("open")).default;
          await open(`http://localhost:${HTTP_PORT}`);
        } catch (error) {
          debugLog("[Browser] Failed to open browser:", error);
        }
      } else {
        debugLog(
          `[Browser] Frontend already connected (${ttsClients.size} client(s))`
        );
      }
    }, 3000);
  }
});

if (IS_MCP_MANAGED) {
  setupMCPServer(HTTP_PORT, voicePreferences.voiceResponsesEnabled);
} else {
  console.log(
    "[MCP] Skipping MCP server initialization (not in MCP-managed mode)"
  );
}

process.on('SIGTERM', () => {
  debugLog('[Shutdown] Received SIGTERM signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  debugLog('[Shutdown] Received SIGINT signal, shutting down gracefully...');
  process.exit(0);
});
