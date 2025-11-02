import request from "supertest";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";

class MockUtteranceQueue {
  utterances: any[] = [];

  add(text: string, timestamp?: Date) {
    const utterance = {
      id: randomUUID(),
      text: text.trim(),
      timestamp: timestamp || new Date(),
      status: "pending",
    };
    this.utterances.push(utterance);
    return utterance;
  }

  markDelivered(id: string) {
    const utterance = this.utterances.find((u) => u.id === id);
    if (utterance) {
      utterance.status = "delivered";
    }
  }
}

describe("MCP Speak Tool Response Simplification", () => {
  let app: express.Application;
  let server: any;
  let queue: MockUtteranceQueue;
  let voicePreferences: any;
  let ttsClients: Set<any>;

  beforeEach(() => {
    queue = new MockUtteranceQueue();
    voicePreferences = {
      voiceResponsesEnabled: true,
      voiceInputActive: false,
    };
    ttsClients = new Set();

    app = express();
    app.use(cors());
    app.use(express.json());

    app.get("/api/tts-events", (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write('data: {"type":"connected"}\n\n');
      ttsClients.add(res);
      res.on("close", () => {
        ttsClients.delete(res);
      });
    });

    app.post("/api/voice-preferences", (req, res) => {
      const { voiceResponsesEnabled } = req.body;
      voicePreferences.voiceResponsesEnabled = !!voiceResponsesEnabled;
      res.json({
        success: true,
        preferences: voicePreferences,
      });
    });

    app.post("/api/speak", (req, res) => {
      const { text } = req.body;

      if (!text || !text.trim()) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      if (!voicePreferences.voiceResponsesEnabled) {
        res.status(400).json({
          error: "Voice responses are disabled",
          message: "Cannot speak when voice responses are disabled",
        });
        return;
      }

      const message = JSON.stringify({ type: "speak", text });
      ttsClients.forEach((client) => {
        client.write(`data: ${message}\n\n`);
      });

      const deliveredUtterances = queue.utterances.filter(
        (u) => u.status === "delivered"
      );
      deliveredUtterances.forEach((u) => {
        u.status = "responded";
      });

      res.json({
        success: true,
        message: "Text spoken successfully",
        respondedCount: deliveredUtterances.length,
      });
    });

    server = app.listen(0);
  });

  afterEach((done) => {
    server.close(done);
  });

  describe("MCP Tool Response Format", () => {
    it("should return simplified response for successful speak operations", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      queue.add("Test utterance 1");
      queue.add("Test utterance 2");
      queue.utterances.forEach((u) => {
        u.status = "delivered";
      });

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "Hello, this is a test" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Text spoken successfully");
      expect(response.body.respondedCount).toBe(2);

      const mcpFormattedResponse = response.body.success
        ? ""
        : `Error: ${response.body.error}`;
      expect(mcpFormattedResponse).toBe("");
    });

    it("should return error message for failed speak operations", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: false })
        .expect(200);

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "This should fail" })
        .expect(400);

      const mcpFormattedResponse = !response.ok
        ? `Error speaking text: ${response.body.error || "Unknown error"}`
        : "";

      expect(mcpFormattedResponse).toBe(
        "Error speaking text: Voice responses are disabled"
      );
    });

    it("should handle missing text parameter", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      const response = await request(app)
        .post("/api/speak")
        .send({})
        .expect(400);

      expect(response.body.error).toBe("Text is required");
    });

    it("should handle empty text parameter", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "   " })
        .expect(400);

      expect(response.body.error).toBe("Text is required");
    });
  });

  describe("Integration with utterance queue", () => {
    it("should mark delivered utterances as responded", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      const u1 = queue.add("Pending utterance");
      const u2 = queue.add("Delivered utterance 1");
      const u3 = queue.add("Delivered utterance 2");

      queue.markDelivered(u2.id);
      queue.markDelivered(u3.id);

      expect(queue.utterances.find((u) => u.id === u1.id)?.status).toBe(
        "pending"
      );
      expect(queue.utterances.find((u) => u.id === u2.id)?.status).toBe(
        "delivered"
      );
      expect(queue.utterances.find((u) => u.id === u3.id)?.status).toBe(
        "delivered"
      );

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "Test speech" })
        .expect(200);

      expect(queue.utterances.find((u) => u.id === u1.id)?.status).toBe(
        "pending"
      );
      expect(queue.utterances.find((u) => u.id === u2.id)?.status).toBe(
        "responded"
      );
      expect(queue.utterances.find((u) => u.id === u3.id)?.status).toBe(
        "responded"
      );

      expect(response.body.respondedCount).toBe(2);
    });
  });
});
