import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { debugLog } from "./debug.ts";

const AUTO_DELIVER_VOICE_INPUT =
  process.env.MCP_VOICE_HOOKS_AUTO_DELIVER_VOICE_INPUT !== "false";

export function setupMCPServer(httpPort: number, voiceResponsesEnabled: boolean) {
  console.error("[MCP] Initializing MCP server...");

  const mcpServer = new Server(
    {
      name: "voice-hooks",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];

    if (!AUTO_DELIVER_VOICE_INPUT) {
      tools.push(
        {
          name: "dequeue_utterances",
          description: "Dequeue pending utterances and mark them as delivered",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "wait_for_utterance",
          description: "Wait for an utterance to be available or until timeout",
          inputSchema: {
            type: "object",
            properties: {},
          },
        }
      );
    }

    tools.push({
      name: "speak",
      description:
        "Speak text using text-to-speech and mark delivered utterances as responded",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to speak",
          },
        },
        required: ["text"],
      },
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
            body: JSON.stringify({}),
          }
        );

        const data = (await response.json()) as any;

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${data.error || "Failed to dequeue utterances"}`,
              },
            ],
          };
        }

        if (data.utterances.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No recent utterances found.",
              },
            ],
          };
        }

        const reminder = voiceResponsesEnabled
          ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding."
          : "";

        return {
          content: [
            {
              type: "text",
              text: `Dequeued ${
                data.utterances.length
              } utterance(s):\n\n${data.utterances
                .reverse()
                .map(
                  (u: any) =>
                    `"${u.text}"\t[time: ${new Date(
                      u.timestamp
                    ).toISOString()}]`
                )
                .join("\n")}${reminder}`,
            },
          ],
        };
      }

      if (name === "wait_for_utterance") {
        debugLog(`[MCP] Calling wait_for_utterance`);

        const response = await fetch(
          `http://localhost:${httpPort}/api/wait-for-utterances`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );

        const data = (await response.json()) as any;

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${data.error || "Failed to wait for utterances"}`,
              },
            ],
          };
        }

        if (data.utterances && data.utterances.length > 0) {
          const utteranceTexts = data.utterances
            .map((u: any) => `[${u.timestamp}] "${u.text}"`)
            .join("\n");

          const reminder = voiceResponsesEnabled
            ? "\n\nThe user has enabled voice responses, so use the 'speak' tool to respond to the user's voice input before proceeding."
            : "";

          return {
            content: [
              {
                type: "text",
                text: `Found ${data.count} utterance(s):\n\n${utteranceTexts}${reminder}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: data.message || `No utterances found. Timed out.`,
              },
            ],
          };
        }
      }

      if (name === "speak") {
        const text = args?.text as string;

        if (!text || !text.trim()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Text is required for speak tool",
              },
            ],
            isError: true,
          };
        }

        const response = await fetch(
          `http://localhost:${httpPort}/api/speak`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }
        );

        const data = (await response.json()) as any;

        if (response.ok) {
          return {
            content: [
              {
                type: "text",
                text: "",
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Error speaking text: ${data.error || "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  mcpServer.connect(transport);
  console.error("[MCP] Server connected via stdio");
}
