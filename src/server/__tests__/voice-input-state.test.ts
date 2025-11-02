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

describe("Voice Input State Error Handling", () => {
  let app: express.Application;
  let server: any;
  let queue: MockUtteranceQueue;
  let voicePreferences: any;

  beforeEach(() => {
    queue = new MockUtteranceQueue();
    voicePreferences = {
      voiceResponsesEnabled: false,
      voiceInputActive: false,
    };

    app = express();
    app.use(cors());
    app.use(express.json());

    app.post("/api/voice-input-state", (req, res) => {
      const { active } = req.body;
      voicePreferences.voiceInputActive = !!active;
      res.json({
        success: true,
        voiceInputActive: voicePreferences.voiceInputActive,
      });
    });

    app.post("/api/dequeue-utterances", (req, res) => {
      if (!voicePreferences.voiceInputActive) {
        res.status(400).json({
          success: false,
          error:
            "Voice input is not active. Cannot dequeue utterances when voice input is disabled.",
        });
        return;
      }

      const pendingUtterances = queue.utterances
        .filter((u) => u.status === "pending")
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      pendingUtterances.forEach((u) => {
        queue.markDelivered(u.id);
      });

      res.json({
        success: true,
        utterances: pendingUtterances.map((u) => ({
          text: u.text,
          timestamp: u.timestamp,
        })),
      });
    });

    app.post("/api/wait-for-utterances", async (req, res) => {
      if (!voicePreferences.voiceInputActive) {
        res.status(400).json({
          success: false,
          error:
            "Voice input is not active. Cannot wait for utterances when voice input is disabled.",
        });
        return;
      }

      const startTime = Date.now();
      const maxWaitMs = 1000;

      while (Date.now() - startTime < maxWaitMs) {
        if (!voicePreferences.voiceInputActive) {
          res.json({
            success: true,
            utterances: [],
            message: "Voice input was deactivated",
            waitTime: Date.now() - startTime,
          });
          return;
        }

        const pendingUtterances = queue.utterances.filter(
          (u) => u.status === "pending"
        );

        if (pendingUtterances.length > 0) {
          pendingUtterances.forEach((u) => {
            queue.markDelivered(u.id);
          });

          res.json({
            success: true,
            utterances: pendingUtterances.map((u) => ({
              text: u.text,
              timestamp: u.timestamp,
            })),
            count: pendingUtterances.length,
            waitTime: Date.now() - startTime,
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      res.json({
        success: true,
        utterances: [],
        message: "No utterances found after waiting.",
        waitTime: maxWaitMs,
      });
    });

    server = app.listen(0);
  });

  afterEach((done) => {
    server.close(done);
  });

  describe("POST /api/dequeue-utterances", () => {
    it("should return 400 error when voice input is not active", async () => {
      voicePreferences.voiceInputActive = false;

      const response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error:
          "Voice input is not active. Cannot dequeue utterances when voice input is disabled.",
      });
    });

    it("should dequeue utterances successfully when voice input is active", async () => {
      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      const now = Date.now();
      queue.utterances.push({
        id: randomUUID(),
        text: "Test utterance 1",
        timestamp: new Date(now - 1000),
        status: "pending",
      });
      queue.utterances.push({
        id: randomUUID(),
        text: "Test utterance 2",
        timestamp: new Date(now),
        status: "pending",
      });

      const response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.utterances).toHaveLength(2);
      expect(response.body.utterances[0].text).toBe("Test utterance 2");
      expect(response.body.utterances[1].text).toBe("Test utterance 1");
    });

    it("should dequeue all pending utterances when voice input is active", async () => {
      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      for (let i = 1; i <= 5; i++) {
        queue.add(`Test utterance ${i}`);
      }

      const response = await request(app)
        .post("/api/dequeue-utterances")
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.utterances).toHaveLength(5);
    });
  });

  describe("POST /api/wait-for-utterances", () => {
    it("should return 400 error when voice input is not active", async () => {
      voicePreferences.voiceInputActive = false;

      const response = await request(app)
        .post("/api/wait-for-utterances")
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error:
          "Voice input is not active. Cannot wait for utterances when voice input is disabled.",
      });
    });

    it("should process wait request when voice input is active", async () => {
      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      const response = await request(app)
        .post("/api/wait-for-utterances")
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.utterances).toBeDefined();
    });

    it("should return immediately when voice input is deactivated during wait", async () => {
      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      const waitPromise = request(app)
        .post("/api/wait-for-utterances")
        .send({});

      setTimeout(async () => {
        voicePreferences.voiceInputActive = false;
      }, 50);

      const response = await waitPromise;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Voice input was deactivated");
      expect(response.body.utterances).toEqual([]);
      expect(response.body.waitTime).toBeLessThan(100);
    });
  });

  describe("Voice input state transitions", () => {
    it("should allow dequeue when voice input is activated", async () => {
      voicePreferences.voiceInputActive = false;

      let response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(400);

      expect(response.body.success).toBe(false);

      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      queue.add("Test utterance");

      response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.utterances).toHaveLength(1);
    });

    it("should prevent dequeue when voice input is deactivated", async () => {
      await request(app)
        .post("/api/voice-input-state")
        .send({ active: true })
        .expect(200);

      queue.add("Test utterance 1");
      let response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);

      await request(app)
        .post("/api/voice-input-state")
        .send({ active: false })
        .expect(200);

      queue.add("Test utterance 2");

      response = await request(app)
        .post("/api/dequeue-utterances")
        .send({ limit: 10 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Voice input is not active");
    });
  });
});
