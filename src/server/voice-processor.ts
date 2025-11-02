import { exec } from "child_process";
import { promisify } from "util";
import type { Response } from "express";
import { debugLog } from "./debug.ts";
import { UtteranceQueue } from "./utterance-queue.ts";

const execAsync = promisify(exec);
const WAIT_TIMEOUT_SECONDS = 60;

export interface VoicePreferences {
  voiceResponsesEnabled: boolean;
  voiceInputActive: boolean;
}

export async function playNotificationSound() {
  try {
    await execAsync("afplay /System/Library/Sounds/Funk.aiff");
    debugLog("[Sound] Played notification sound");
  } catch (error) {
    debugLog(`[Sound] Failed to play sound: ${error}`);
  }
}

export function dequeueUtterancesCore(
  queue: UtteranceQueue,
  voicePreferences: VoicePreferences
) {
  if (!voicePreferences.voiceInputActive) {
    return {
      success: false,
      error:
        "Voice input is not active. Cannot dequeue utterances when voice input is disabled.",
    };
  }

  const pendingUtterances = queue
    .getPending()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  pendingUtterances.forEach((u) => queue.markDelivered(u.id));

  return {
    success: true,
    utterances: pendingUtterances.map((u) => ({
      text: u.text,
      timestamp: u.timestamp,
    })),
  };
}

export async function waitForUtteranceCore(
  queue: UtteranceQueue,
  voicePreferences: VoicePreferences,
  notifyWaitStatus: (isWaiting: boolean) => void
) {
  if (!voicePreferences.voiceInputActive) {
    return {
      success: false,
      error:
        "Voice input is not active. Cannot wait for utterances when voice input is disabled.",
    };
  }

  const secondsToWait = WAIT_TIMEOUT_SECONDS;
  const maxWaitMs = secondsToWait * 1000;
  const startTime = Date.now();

  debugLog(`[WaitCore] Starting wait_for_utterance (${secondsToWait}s)`);
  notifyWaitStatus(true);

  let firstTime = true;

  while (Date.now() - startTime < maxWaitMs) {
    if (!voicePreferences.voiceInputActive) {
      debugLog("[WaitCore] Voice input deactivated during wait_for_utterance");
      notifyWaitStatus(false);
      return {
        success: true,
        utterances: [],
        message: "Voice input was deactivated",
        waitTime: Date.now() - startTime,
      };
    }

    const pendingUtterances = queue.getPending();

    if (pendingUtterances.length > 0) {
      const sortedUtterances = pendingUtterances.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      sortedUtterances.forEach((u) => queue.markDelivered(u.id));

      notifyWaitStatus(false);
      return {
        success: true,
        utterances: sortedUtterances.map((u) => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          status: "delivered" as const,
        })),
        count: pendingUtterances.length,
        waitTime: Date.now() - startTime,
      };
    }

    if (firstTime) {
      firstTime = false;
      await playNotificationSound();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  notifyWaitStatus(false);
  return {
    success: true,
    utterances: [],
    message: `No utterances found after waiting ${secondsToWait} seconds.`,
    waitTime: maxWaitMs,
  };
}

export function formatVoiceUtterances(
  utterances: any[],
  voiceResponsesEnabled: boolean
): string {
  const utteranceTexts = utterances.map((u) => `"${u.text}"`).join("\n");

  const reminder = voiceResponsesEnabled
    ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding."
    : "";

  return `Assistant received voice input from the user (${
    utterances.length
  } utterance${utterances.length !== 1 ? "s" : ""}):\n\n${utteranceTexts}${reminder}`;
}

export function notifyTTSClients(ttsClients: Set<Response>, text: string) {
  const message = JSON.stringify({ type: "speak", text });
  ttsClients.forEach((client) => {
    client.write(`data: ${message}\n\n`);
  });
}

export function notifyWaitStatus(ttsClients: Set<Response>, isWaiting: boolean) {
  const message = JSON.stringify({ type: "waitStatus", isWaiting });
  ttsClients.forEach((client) => {
    client.write(`data: ${message}\n\n`);
  });
}
