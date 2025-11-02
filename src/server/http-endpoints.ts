import type { Express, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { debugLog } from "./debug.ts";
import { UtteranceQueue } from "./utterance-queue.ts";
import {
  VoicePreferences,
  dequeueUtterancesCore,
  waitForUtteranceCore,
  notifyTTSClients,
  notifyWaitStatus as notifyWaitStatusUtil,
  formatVoiceUtterances,
} from "./voice-processor.ts";

const execAsync = promisify(exec);
const AUTO_DELIVER_VOICE_INPUT =
  process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";

export interface HookResult {
  decision: "approve" | "block";
  reason?: string;
}

export function setupHttpEndpoints(
  app: Express,
  queue: UtteranceQueue,
  voicePreferences: VoicePreferences,
  ttsClients: Set<Response>,
  lastToolUseTimestamp: { current: Date | null },
  lastSpeakTimestamp: { current: Date | null },
  dirname: string
) {
  app.post("/api/potential-utterances", (req: Request, res: Response) => {
    const { text, timestamp } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const parsedTimestamp = timestamp ? new Date(timestamp) : undefined;
    const utterance = queue.add(text, parsedTimestamp);
    res.json({
      success: true,
      utterance: {
        id: utterance.id,
        text: utterance.text,
        timestamp: utterance.timestamp,
        status: utterance.status,
      },
    });
  });

  app.get("/api/utterances", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const utterances = queue.getRecent(limit);

    res.json({
      utterances: utterances.map((u) => ({
        id: u.id,
        text: u.text,
        timestamp: u.timestamp,
        status: u.status,
      })),
    });
  });

  app.get("/api/utterances/status", (_req: Request, res: Response) => {
    const total = queue.utterances.length;
    const pending = queue.getPending().length;
    const delivered = queue.getDelivered().length;

    res.json({ total, pending, delivered });
  });

  app.post("/api/dequeue-utterances", (_req: Request, res: Response) => {
    const result = dequeueUtterancesCore(queue, voicePreferences);

    if (!result.success && result.error) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  });

  app.post("/api/wait-for-utterances", async (_req: Request, res: Response) => {
    const notifyFn = (isWaiting: boolean) =>
      notifyWaitStatusUtil(ttsClients, isWaiting);
    const result = await waitForUtteranceCore(
      queue,
      voicePreferences,
      notifyFn
    );

    if (!result.success && result.error) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  });

  app.delete("/api/utterances", (_req: Request, res: Response) => {
    const clearedCount = queue.utterances.length;
    queue.clear();

    res.json({
      success: true,
      message: `Cleared ${clearedCount} utterances`,
      clearedCount,
    });
  });

  app.post("/api/voice-preferences", (req: Request, res: Response) => {
    const { voiceResponsesEnabled } = req.body;
    voicePreferences.voiceResponsesEnabled = !!voiceResponsesEnabled;

    debugLog(
      `[Preferences] Updated: voiceResponses=${voicePreferences.voiceResponsesEnabled}`
    );

    res.json({
      success: true,
      preferences: voicePreferences,
    });
  });

  app.post("/api/voice-input-state", (req: Request, res: Response) => {
    const { active } = req.body;
    voicePreferences.voiceInputActive = !!active;

    debugLog(
      `[Voice Input] ${
        voicePreferences.voiceInputActive ? "Started" : "Stopped"
      } listening`
    );

    res.json({
      success: true,
      voiceInputActive: voicePreferences.voiceInputActive,
    });
  });

  app.get("/api/tts-events", (_req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write('data: {"type":"connected"}\n\n');
    ttsClients.add(res);

    res.on("close", () => {
      ttsClients.delete(res);

      if (ttsClients.size === 0) {
        debugLog("[SSE] Last browser disconnected, disabling voice features");
        if (
          voicePreferences.voiceInputActive ||
          voicePreferences.voiceResponsesEnabled
        ) {
          debugLog(
            `[SSE] Voice features disabled - Input: ${voicePreferences.voiceInputActive} -> false, Responses: ${voicePreferences.voiceResponsesEnabled} -> false`
          );
          voicePreferences.voiceInputActive = false;
          voicePreferences.voiceResponsesEnabled = false;
        }
      } else {
        debugLog(
          `[SSE] Browser disconnected, ${ttsClients.size} client(s) remaining`
        );
      }
    });
  });

  app.post("/api/speak", async (req: Request, res: Response) => {
    const { text } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    try {
      const deliveredUtterances = queue.getDelivered();
      deliveredUtterances.forEach((u) => {
        queue.markResponded(u.id);
      });

      lastSpeakTimestamp.current = new Date();

      if (ttsClients.size > 0) {
        notifyTTSClients(ttsClients, text);
        debugLog(`[Speak] Sent text to browser for TTS: "${text}"`);
      } else {
        debugLog(
          `[Speak] No browser connected, but marked ${deliveredUtterances.length} utterances as responded`
        );
      }

      res.json({
        success: true,
        message:
          ttsClients.size > 0
            ? "Text spoken successfully"
            : "No browser connected, but utterances marked as responded",
        respondedCount: deliveredUtterances.length,
        browserConnected: ttsClients.size > 0,
      });
    } catch (error) {
      debugLog(`[Speak] Failed to speak text: ${error}`);
      res.status(500).json({
        error: "Failed to speak text",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/speak-system", async (req: Request, res: Response) => {
    const { text, rate = 150 } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    try {
      await execAsync(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`);
      debugLog(
        `[Speak System] Spoke text using macOS say: "${text}" (rate: ${rate})`
      );

      res.json({
        success: true,
        message: "Text spoken successfully via system voice",
      });
    } catch (error) {
      debugLog(`[Speak System] Failed to speak text: ${error}`);
      res.status(500).json({
        error: "Failed to speak text via system voice",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/validate-action", (req: Request, res: Response) => {
    const { action } = req.body;

    if (!action || !["tool-use", "stop"].includes(action)) {
      res
        .status(400)
        .json({ error: 'Invalid action. Must be "tool-use" or "stop"' });
      return;
    }

    if (voicePreferences.voiceInputActive) {
      const pendingUtterances = queue.getPending();
      if (pendingUtterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "dequeue_utterances",
          reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`,
        });
        return;
      }
    }

    if (voicePreferences.voiceResponsesEnabled) {
      const deliveredUtterances = queue.getDelivered();
      if (deliveredUtterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "speak",
          reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
        });
        return;
      }
    }

    if (action === "stop" && voicePreferences.voiceInputActive) {
      if (queue.utterances.length > 0) {
        res.json({
          allowed: false,
          requiredAction: "wait_for_utterance",
          reason:
            "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
        });
        return;
      }
    }

    res.json({ allowed: true });
  });

  const handleHookRequest = (
    attemptedAction: "tool" | "speak" | "wait" | "stop" | "post-tool"
  ): HookResult | Promise<HookResult> => {
    const voiceResponsesEnabled = voicePreferences.voiceResponsesEnabled;
    const voiceInputActive = voicePreferences.voiceInputActive;

    if (voiceInputActive) {
      const pendingUtterances = queue.getPending();
      if (pendingUtterances.length > 0) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          const dequeueResult = dequeueUtterancesCore(queue, voicePreferences);

          if (
            dequeueResult.success &&
            dequeueResult.utterances &&
            dequeueResult.utterances.length > 0
          ) {
            const reversedUtterances = dequeueResult.utterances.reverse();

            return {
              decision: "block",
              reason: formatVoiceUtterances(
                reversedUtterances,
                voiceResponsesEnabled
              ),
            };
          }
        } else {
          return {
            decision: "block",
            reason: `${pendingUtterances.length} pending utterance(s) available. Use the dequeue_utterances tool to retrieve them.`,
          };
        }
      }
    }

    if (voiceResponsesEnabled) {
      const deliveredUtterances = queue.getDelivered();
      if (deliveredUtterances.length > 0) {
        if (attemptedAction === "speak") {
          return { decision: "approve" };
        }
        return {
          decision: "block",
          reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
        };
      }
    }

    if (attemptedAction === "tool" || attemptedAction === "post-tool") {
      lastToolUseTimestamp.current = new Date();
      return { decision: "approve" };
    }

    if (attemptedAction === "wait") {
      if (
        voiceResponsesEnabled &&
        lastToolUseTimestamp.current &&
        (!lastSpeakTimestamp.current ||
          lastSpeakTimestamp.current < lastToolUseTimestamp.current)
      ) {
        return {
          decision: "block",
          reason:
            "Assistant must speak after using tools. Please use the speak tool to respond before waiting for utterances.",
        };
      }
      return { decision: "approve" };
    }

    if (attemptedAction === "speak") {
      return { decision: "approve" };
    }

    if (attemptedAction === "stop") {
      if (
        voiceResponsesEnabled &&
        lastToolUseTimestamp.current &&
        (!lastSpeakTimestamp.current ||
          lastSpeakTimestamp.current < lastToolUseTimestamp.current)
      ) {
        return {
          decision: "block",
          reason:
            "Assistant must speak after using tools. Please use the speak tool to respond before proceeding.",
        };
      }

      if (voiceInputActive) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          return (async () => {
            try {
              debugLog(`[Stop Hook] Auto-calling wait_for_utterance...`);
              const notifyFn = (isWaiting: boolean) =>
                notifyWaitStatusUtil(ttsClients, isWaiting);
              const data = await waitForUtteranceCore(
                queue,
                voicePreferences,
                notifyFn
              );
              debugLog(
                `[Stop Hook] wait_for_utterance response: ${JSON.stringify(data)}`
              );

              if (!data.success && data.error) {
                return {
                  decision: "approve" as const,
                  reason: data.error,
                };
              }

              if (data.utterances && data.utterances.length > 0) {
                return {
                  decision: "block" as const,
                  reason: formatVoiceUtterances(
                    data.utterances,
                    voiceResponsesEnabled
                  ),
                };
              }

              return {
                decision: "approve" as const,
                reason: data.message || "No utterances found during wait",
              };
            } catch (error) {
              debugLog(
                `[Stop Hook] Error calling wait_for_utterance: ${error}`
              );
              return {
                decision: "approve" as const,
                reason: "Auto-wait encountered an error, proceeding",
              };
            }
          })();
        } else {
          return {
            decision: "block",
            reason:
              "Assistant tried to end its response, but voice input is active. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
          };
        }
      }

      return {
        decision: "approve",
        reason: "No utterances since last timeout",
      };
    }

    return { decision: "approve" };
  };

  app.post("/api/hooks/stop", async (_req: Request, res: Response) => {
    const result = await handleHookRequest("stop");
    res.json(result);
  });

  app.post("/api/hooks/pre-speak", (_req: Request, res: Response) => {
    const result = handleHookRequest("speak");
    res.json(result);
  });

  app.post("/api/hooks/pre-wait", (_req: Request, res: Response) => {
    const result = handleHookRequest("wait");
    res.json(result);
  });

  app.post("/api/hooks/post-tool", (_req: Request, res: Response) => {
    const result = handleHookRequest("post-tool");
    res.json(result);
  });

  app.post("/api/hooks/user-prompt-submit", (req: Request, res: Response) => {
    const voiceInputActive = voicePreferences.voiceInputActive;

    if (voiceInputActive) {
      const pendingUtterances = queue.getPending();
      if (pendingUtterances.length > 0) {
        if (AUTO_DELIVER_VOICE_INPUT) {
          const dequeueResult = dequeueUtterancesCore(queue, voicePreferences);

          if (
            dequeueResult.success &&
            dequeueResult.utterances &&
            dequeueResult.utterances.length > 0
          ) {
            const reversedUtterances = dequeueResult.utterances.reverse();

            res.json({
              decision: "block",
              reason: formatVoiceUtterances(
                reversedUtterances,
                voicePreferences.voiceResponsesEnabled
              ),
            });
            return;
          }
        } else {
          res.json({
            decision: "block",
            reason: `${pendingUtterances.length} pending utterance(s) available. Use the dequeue_utterances tool to retrieve them.`,
          });
          return;
        }
      }
    }

    res.json({ decision: "approve" });
  });

  app.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(dirname, "..", "client", "index.html"));
  });
}
