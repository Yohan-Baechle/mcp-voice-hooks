#!/usr/bin/env node

// src/server/unified-server.ts
import express from "express";
import cors from "cors";
import path2 from "path";
import { fileURLToPath } from "url";

// src/server/debug.ts
var DEBUG = process.env.DEBUG === "true" || process.env.VOICE_HOOKS_DEBUG === "true";
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// src/server/utterance-queue.ts
import { randomUUID } from "crypto";
var UtteranceQueue = class {
  utterances = [];
  add(text, timestamp) {
    const utterance = {
      id: randomUUID(),
      text: text.trim(),
      timestamp: timestamp || /* @__PURE__ */ new Date(),
      status: "pending"
    };
    this.utterances.push(utterance);
    debugLog(`[Queue] queued: "${utterance.text}"	[id: ${utterance.id}]`);
    return utterance;
  }
  getRecent(limit = 10) {
    return this.utterances.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
  markDelivered(id) {
    const utterance = this.utterances.find((u) => u.id === id);
    if (utterance) {
      utterance.status = "delivered";
      debugLog(`[Queue] delivered: "${utterance.text}"	[id: ${id}]`);
    }
  }
  markResponded(id) {
    const utterance = this.utterances.find((u) => u.id === id);
    if (utterance) {
      utterance.status = "responded";
      debugLog(`[Queue] marked as responded: "${utterance.text}"	[id: ${id}]`);
    }
  }
  getPending() {
    return this.utterances.filter((u) => u.status === "pending");
  }
  getDelivered() {
    return this.utterances.filter((u) => u.status === "delivered");
  }
  clear() {
    const count = this.utterances.length;
    this.utterances = [];
    debugLog(`[Queue] Cleared ${count} utterances`);
  }
};

// src/server/http-endpoints.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
import path from "path";

// src/server/voice-processor.ts
import { exec } from "child_process";
import { promisify } from "util";
var execAsync = promisify(exec);
var WAIT_TIMEOUT_SECONDS = 60;
async function playNotificationSound() {
  try {
    await execAsync("afplay /System/Library/Sounds/Funk.aiff");
    debugLog("[Sound] Played notification sound");
  } catch (error) {
    debugLog(`[Sound] Failed to play sound: ${error}`);
  }
}
function dequeueUtterancesCore(queue2, voicePreferences2) {
  if (!voicePreferences2.voiceInputActive) {
    return {
      success: false,
      error: "Voice input is not active. Cannot dequeue utterances when voice input is disabled."
    };
  }
  const pendingUtterances = queue2.getPending().sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  pendingUtterances.forEach((u) => queue2.markDelivered(u.id));
  return {
    success: true,
    utterances: pendingUtterances.map((u) => ({
      text: u.text,
      timestamp: u.timestamp
    }))
  };
}
async function waitForUtteranceCore(queue2, voicePreferences2, notifyWaitStatus2) {
  if (!voicePreferences2.voiceInputActive) {
    return {
      success: false,
      error: "Voice input is not active. Cannot wait for utterances when voice input is disabled."
    };
  }
  const secondsToWait = WAIT_TIMEOUT_SECONDS;
  const maxWaitMs = secondsToWait * 1e3;
  const startTime = Date.now();
  debugLog(`[WaitCore] Starting wait_for_utterance (${secondsToWait}s)`);
  notifyWaitStatus2(true);
  let firstTime = true;
  while (Date.now() - startTime < maxWaitMs) {
    if (!voicePreferences2.voiceInputActive) {
      debugLog("[WaitCore] Voice input deactivated during wait_for_utterance");
      notifyWaitStatus2(false);
      return {
        success: true,
        utterances: [],
        message: "Voice input was deactivated",
        waitTime: Date.now() - startTime
      };
    }
    const pendingUtterances = queue2.getPending();
    if (pendingUtterances.length > 0) {
      const sortedUtterances = pendingUtterances.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      sortedUtterances.forEach((u) => queue2.markDelivered(u.id));
      notifyWaitStatus2(false);
      return {
        success: true,
        utterances: sortedUtterances.map((u) => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          status: "delivered"
        })),
        count: pendingUtterances.length,
        waitTime: Date.now() - startTime
      };
    }
    if (firstTime) {
      firstTime = false;
      await playNotificationSound();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  notifyWaitStatus2(false);
  return {
    success: true,
    utterances: [],
    message: `No utterances found after waiting ${secondsToWait} seconds.`,
    waitTime: maxWaitMs
  };
}
function formatVoiceUtterances(utterances, voiceResponsesEnabled) {
  const utteranceTexts = utterances.map((u) => `"${u.text}"`).join("\n");
  const reminder = voiceResponsesEnabled ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding." : "";
  return `Assistant received voice input from the user (${utterances.length} utterance${utterances.length !== 1 ? "s" : ""}):

${utteranceTexts}${reminder}`;
}
function notifyTTSClients(ttsClients2, text) {
  const message = JSON.stringify({ type: "speak", text });
  ttsClients2.forEach((client) => {
    client.write(`data: ${message}

`);
  });
}
function notifyWaitStatus(ttsClients2, isWaiting) {
  const message = JSON.stringify({ type: "waitStatus", isWaiting });
  ttsClients2.forEach((client) => {
    client.write(`data: ${message}

`);
  });
}

// src/server/http-endpoints.ts
var execAsync2 = promisify2(exec2);
var AUTO_DELIVER_VOICE_INPUT = process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";
function setupHttpEndpoints(app2, queue2, voicePreferences2, ttsClients2, lastToolUseTimestamp2, lastSpeakTimestamp2, dirname) {
  app2.post("/api/potential-utterances", (req, res) => {
    const { text, timestamp } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const parsedTimestamp = timestamp ? new Date(timestamp) : void 0;
    const utterance = queue2.add(text, parsedTimestamp);
    res.json({
      success: true,
      utterance: {
        id: utterance.id,
        text: utterance.text,
        timestamp: utterance.timestamp,
        status: utterance.status
      }
    });
  });
  app2.get("/api/utterances", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const utterances = queue2.getRecent(limit);
    res.json({
      utterances: utterances.map((u) => ({
        id: u.id,
        text: u.text,
        timestamp: u.timestamp,
        status: u.status
      }))
    });
  });
  app2.get("/api/utterances/status", (_req, res) => {
    const total = queue2.utterances.length;
    const pending = queue2.getPending().length;
    const delivered = queue2.getDelivered().length;
    res.json({ total, pending, delivered });
  });
  app2.post("/api/dequeue-utterances", (_req, res) => {
    const result = dequeueUtterancesCore(queue2, voicePreferences2);
    if (!result.success && result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });
  app2.post("/api/wait-for-utterances", async (_req, res) => {
    const notifyFn = (isWaiting) => notifyWaitStatus(ttsClients2, isWaiting);
    const result = await waitForUtteranceCore(
      queue2,
      voicePreferences2,
      notifyFn
    );
    if (!result.success && result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });
  app2.delete("/api/utterances", (_req, res) => {
    const clearedCount = queue2.utterances.length;
    queue2.clear();
    res.json({
      success: true,
      message: `Cleared ${clearedCount} utterances`,
      clearedCount
    });
  });
  app2.post("/api/voice-preferences", (req, res) => {
    const { voiceResponsesEnabled } = req.body;
    voicePreferences2.voiceResponsesEnabled = !!voiceResponsesEnabled;
    debugLog(
      `[Preferences] Updated: voiceResponses=${voicePreferences2.voiceResponsesEnabled}`
    );
    res.json({
      success: true,
      preferences: voicePreferences2
    });
  });
  app2.post("/api/voice-input-state", (req, res) => {
    const { active } = req.body;
    voicePreferences2.voiceInputActive = !!active;
    debugLog(
      `[Voice Input] ${voicePreferences2.voiceInputActive ? "Started" : "Stopped"} listening`
    );
    res.json({
      success: true,
      voiceInputActive: voicePreferences2.voiceInputActive
    });
  });
  app2.get("/api/tts-events", (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write('data: {"type":"connected"}\n\n');
    ttsClients2.add(res);
    res.on("close", () => {
      ttsClients2.delete(res);
      if (ttsClients2.size === 0) {
        debugLog("[SSE] Last browser disconnected, disabling voice features");
        if (voicePreferences2.voiceInputActive || voicePreferences2.voiceResponsesEnabled) {
          debugLog(
            `[SSE] Voice features disabled - Input: ${voicePreferences2.voiceInputActive} -> false, Responses: ${voicePreferences2.voiceResponsesEnabled} -> false`
          );
          voicePreferences2.voiceInputActive = false;
          voicePreferences2.voiceResponsesEnabled = false;
        }
      } else {
        debugLog(
          `[SSE] Browser disconnected, ${ttsClients2.size} client(s) remaining`
        );
      }
    });
  });
  app2.post("/api/speak", async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    try {
      const deliveredUtterances = queue2.getDelivered();
      deliveredUtterances.forEach((u) => {
        queue2.markResponded(u.id);
      });
      lastSpeakTimestamp2.current = /* @__PURE__ */ new Date();
      if (ttsClients2.size > 0) {
        notifyTTSClients(ttsClients2, text);
        debugLog(`[Speak] Sent text to browser for TTS: "${text}"`);
      } else {
        debugLog(
          `[Speak] No browser connected, but marked ${deliveredUtterances.length} utterances as responded`
        );
      }
      res.json({
        success: true,
        message: ttsClients2.size > 0 ? "Text spoken successfully" : "No browser connected, but utterances marked as responded",
        respondedCount: deliveredUtterances.length,
        browserConnected: ttsClients2.size > 0
      });
    } catch (error) {
      debugLog(`[Speak] Failed to speak text: ${error}`);
      res.status(500).json({
        error: "Failed to speak text",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.post("/api/speak-system", async (req, res) => {
    const { text, rate = 150 } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    try {
      await execAsync2(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`);
      debugLog(
        `[Speak System] Spoke text using macOS say: "${text}" (rate: ${rate})`
      );
      res.json({
        success: true,
        message: "Text spoken successfully via system voice"
      });
    } catch (error) {
      debugLog(`[Speak System] Failed to speak text: ${error}`);
      res.status(500).json({
        error: "Failed to speak text via system voice",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.post("/api/validate-action", (req, res) => {
    const { action } = req.body;
    if (!action || !["tool-use", "stop"].includes(action)) {
      res.status(400).json({ error: 'Invalid action. Must be "tool-use" or "stop"' });
      return;
    }
    if (voicePreferences2.voiceInputActive) {
      const pendingUtterances = queue2.getPending();
      if (pendingUtterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "dequeue_utterances",
          reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`
        });
        return;
      }
    }
    if (voicePreferences2.voiceResponsesEnabled) {
      const deliveredUtterances = queue2.getDelivered();
      if (deliveredUtterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "speak",
          reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`
        });
        return;
      }
    }
    if (action === "stop" && voicePreferences2.voiceInputActive) {
      if (queue2.utterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "wait_for_utterance",
          reason: "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input"
        });
        return;
      }
    }
    res.json({ allowed: true });
  });
  const handleHookRequest = (attemptedAction) => {
    const voiceResponsesEnabled = voicePreferences2.voiceResponsesEnabled;
    const voiceInputActive = voicePreferences2.voiceInputActive;
    if (voiceInputActive) {
      const pendingUtterances = queue2.getPending();
      if (pendingUtterances.length > 0) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          const dequeueResult = dequeueUtterancesCore(queue2, voicePreferences2);
          if (dequeueResult.success && dequeueResult.utterances && dequeueResult.utterances.length > 0) {
            const reversedUtterances = dequeueResult.utterances.reverse();
            return {
              decision: "block",
              reason: formatVoiceUtterances(
                reversedUtterances,
                voiceResponsesEnabled
              )
            };
          }
        } else {
          return {
            decision: "block",
            reason: `${pendingUtterances.length} pending utterance(s) available. Use the dequeue_utterances tool to retrieve them.`
          };
        }
      }
    }
    if (voiceResponsesEnabled) {
      const deliveredUtterances = queue2.getDelivered();
      if (deliveredUtterances.length > 0) {
        if (attemptedAction === "speak") {
          return { decision: "approve" };
        }
        return {
          decision: "block",
          reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`
        };
      }
    }
    if (attemptedAction === "tool" || attemptedAction === "post-tool") {
      lastToolUseTimestamp2.current = /* @__PURE__ */ new Date();
      return { decision: "approve" };
    }
    if (attemptedAction === "wait") {
      if (voiceResponsesEnabled && lastToolUseTimestamp2.current && (!lastSpeakTimestamp2.current || lastSpeakTimestamp2.current < lastToolUseTimestamp2.current)) {
        return {
          decision: "block",
          reason: "Assistant must speak after using tools. Please use the speak tool to respond before waiting for utterances."
        };
      }
      return { decision: "approve" };
    }
    if (attemptedAction === "speak") {
      return { decision: "approve" };
    }
    if (attemptedAction === "stop") {
      if (voiceResponsesEnabled && lastToolUseTimestamp2.current && (!lastSpeakTimestamp2.current || lastSpeakTimestamp2.current < lastToolUseTimestamp2.current)) {
        return {
          decision: "block",
          reason: "Assistant must speak after using tools. Please use the speak tool to respond before proceeding."
        };
      }
      if (voiceInputActive) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          return (async () => {
            try {
              debugLog(`[Stop Hook] Auto-calling wait_for_utterance...`);
              const notifyFn = (isWaiting) => notifyWaitStatus(ttsClients2, isWaiting);
              const data = await waitForUtteranceCore(
                queue2,
                voicePreferences2,
                notifyFn
              );
              debugLog(
                `[Stop Hook] wait_for_utterance response: ${JSON.stringify(data)}`
              );
              if (!data.success && data.error) {
                return {
                  decision: "approve",
                  reason: data.error
                };
              }
              if (data.utterances && data.utterances.length > 0) {
                return {
                  decision: "block",
                  reason: formatVoiceUtterances(
                    data.utterances,
                    voiceResponsesEnabled
                  )
                };
              }
              return {
                decision: "approve",
                reason: data.message || "No utterances found during wait"
              };
            } catch (error) {
              debugLog(
                `[Stop Hook] Error calling wait_for_utterance: ${error}`
              );
              return {
                decision: "approve",
                reason: "Auto-wait encountered an error, proceeding"
              };
            }
          })();
        } else {
          return {
            decision: "block",
            reason: "Assistant tried to end its response, but voice input is active. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input"
          };
        }
      }
      return {
        decision: "approve",
        reason: "No utterances since last timeout"
      };
    }
    return { decision: "approve" };
  };
  app2.post("/api/hooks/stop", async (_req, res) => {
    const result = await handleHookRequest("stop");
    res.json(result);
  });
  app2.post("/api/hooks/pre-speak", (_req, res) => {
    const result = handleHookRequest("speak");
    res.json(result);
  });
  app2.post("/api/hooks/pre-wait", (_req, res) => {
    const result = handleHookRequest("wait");
    res.json(result);
  });
  app2.post("/api/hooks/post-tool", (_req, res) => {
    const result = handleHookRequest("post-tool");
    res.json(result);
  });
  app2.post("/api/hooks/user-prompt-submit", (req, res) => {
    const voiceInputActive = voicePreferences2.voiceInputActive;
    if (voiceInputActive) {
      const pendingUtterances = queue2.getPending();
      if (pendingUtterances.length > 0) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          const dequeueResult = dequeueUtterancesCore(queue2, voicePreferences2);
          if (dequeueResult.success && dequeueResult.utterances && dequeueResult.utterances.length > 0) {
            const reversedUtterances = dequeueResult.utterances.reverse();
            res.json({
              decision: "block",
              reason: formatVoiceUtterances(
                reversedUtterances,
                voicePreferences2.voiceResponsesEnabled
              )
            });
            return;
          }
        } else {
          res.json({
            decision: "block",
            reason: `${pendingUtterances.length} pending utterance(s) available. Use the dequeue_utterances tool to retrieve them.`
          });
          return;
        }
      }
    }
    res.json({ decision: "approve" });
  });
  app2.get("/", (_req, res) => {
    res.sendFile(path.join(dirname, "..", "client", "index.html"));
  });
}

// src/server/mcp-handler.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
var AUTO_DELIVER_VOICE_INPUT2 = process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";
function setupMCPServer(httpPort, voiceResponsesEnabled) {
  console.error("[MCP] Initializing MCP server...");
  const mcpServer = new Server(
    {
      name: "voice-hooks",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];
    if (!AUTO_DELIVER_VOICE_INPUT2) {
      tools.push(
        {
          name: "dequeue_utterances",
          description: "Dequeue pending utterances and mark them as delivered",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "wait_for_utterance",
          description: "Wait for an utterance to be available or until timeout",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      );
    }
    tools.push({
      name: "speak",
      description: "Speak text using text-to-speech and mark delivered utterances as responded",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to speak"
          }
        },
        required: ["text"]
      }
    });
    return { tools };
  });
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (name === "dequeue_utterances") {
        const response = await fetch(
          `http://localhost:${httpPort}/api/dequeue-utterances`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          }
        );
        const data = await response.json();
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${data.error || "Failed to dequeue utterances"}`
              }
            ]
          };
        }
        if (data.utterances.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No recent utterances found."
              }
            ]
          };
        }
        const reminder = voiceResponsesEnabled ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding." : "";
        return {
          content: [
            {
              type: "text",
              text: `Dequeued ${data.utterances.length} utterance(s):

${data.utterances.reverse().map(
                (u) => `"${u.text}"	[time: ${new Date(
                  u.timestamp
                ).toISOString()}]`
              ).join("\n")}${reminder}`
            }
          ]
        };
      }
      if (name === "wait_for_utterance") {
        debugLog(`[MCP] Calling wait_for_utterance`);
        const response = await fetch(
          `http://localhost:${httpPort}/api/wait-for-utterances`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          }
        );
        const data = await response.json();
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${data.error || "Failed to wait for utterances"}`
              }
            ]
          };
        }
        if (data.utterances && data.utterances.length > 0) {
          const utteranceTexts = data.utterances.map((u) => `[${u.timestamp}] "${u.text}"`).join("\n");
          const reminder = voiceResponsesEnabled ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding." : "";
          return {
            content: [
              {
                type: "text",
                text: `Found ${data.count} utterance(s):

${utteranceTexts}${reminder}`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: data.message || `No utterances found. Timed out.`
              }
            ]
          };
        }
      }
      if (name === "speak") {
        const text = args?.text;
        if (!text || !text.trim()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Text is required for speak tool"
              }
            ],
            isError: true
          };
        }
        const response = await fetch(
          `http://localhost:${httpPort}/api/speak`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          }
        );
        const data = await response.json();
        if (response.ok) {
          return {
            content: [
              {
                type: "text",
                text: ""
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Error speaking text: ${data.error || "Unknown error"}`
              }
            ],
            isError: true
          };
        }
      }
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  });
  const transport = new StdioServerTransport();
  mcpServer.connect(transport);
  console.error("[MCP] Server connected via stdio");
}

// src/server/unified-server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var HTTP_PORT = process.env.MCP_VOICE_HOOKS_PORT ? parseInt(process.env.MCP_VOICE_HOOKS_PORT) : 5111;
var AUTO_DELIVER_VOICE_INPUT3 = process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";
var IS_MCP_MANAGED = process.argv.includes("--mcp-managed");
var queue = new UtteranceQueue();
var lastToolUseTimestamp = { current: null };
var lastSpeakTimestamp = { current: null };
var voicePreferences = {
  voiceResponsesEnabled: true,
  voiceInputActive: false
};
var ttsClients = /* @__PURE__ */ new Set();
var app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path2.join(__dirname, "..", "client")));
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
      `[Auto-deliver] Voice input auto-delivery is ${AUTO_DELIVER_VOICE_INPUT3 ? "enabled (tools hidden)" : "disabled (tools shown)"}`
    );
  } else {
    console.error(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.error(`[Mode] Running in MCP-managed mode`);
    console.error(
      `[Auto-deliver] Voice input auto-delivery is ${AUTO_DELIVER_VOICE_INPUT3 ? "enabled (tools hidden)" : "disabled (tools shown)"}`
    );
  }
  const autoOpenBrowser = process.env.MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER !== "false";
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
    }, 3e3);
  }
});
if (IS_MCP_MANAGED) {
  setupMCPServer(HTTP_PORT, voicePreferences.voiceResponsesEnabled);
} else {
  console.log(
    "[MCP] Skipping MCP server initialization (not in MCP-managed mode)"
  );
}
process.on("SIGTERM", () => {
  debugLog("[Shutdown] Received SIGTERM signal, shutting down gracefully...");
  process.exit(0);
});
process.on("SIGINT", () => {
  debugLog("[Shutdown] Received SIGINT signal, shutting down gracefully...");
  process.exit(0);
});
//# sourceMappingURL=unified-server.js.map