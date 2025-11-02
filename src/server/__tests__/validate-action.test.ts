import request from "supertest";
import express from "express";
import type { Response } from "express";

describe("validate-action endpoint", () => {
  let app: express.Application;
  let queue: any;

  beforeEach(() => {
    delete process.env.VOICE_RESPONSES_ENABLED;
    delete process.env.VOICE_INPUT_ACTIVE;

    queue = {
      utterances: [],
    };

    app = express();
    app.use(express.json());

    app.post("/api/validate-action", (req: express.Request, res: Response) => {
      const { action } = req.body;
      const voiceResponsesEnabled =
        process.env.VOICE_RESPONSES_ENABLED === "true";
      const voiceInputActive = process.env.VOICE_INPUT_ACTIVE === "true";

      if (!action || !["tool-use", "stop"].includes(action)) {
        res
          .status(400)
          .json({ error: 'Invalid action. Must be "tool-use" or "stop"' });
        return;
      }

      if (voiceInputActive) {
        const pendingUtterances = queue.utterances.filter(
          (u: any) => u.status === "pending"
        );
        if (pendingUtterances.length > 0) {
          res.json({
            allowed: false,
            requiredAction: "dequeue_utterances",
            reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first`,
          });
          return;
        }
      }

      if (voiceResponsesEnabled) {
        const deliveredUtterances = queue.utterances.filter(
          (u: any) => u.status === "delivered"
        );
        if (deliveredUtterances.length > 0) {
          res.json({
            allowed: false,
            requiredAction: "speak",
            reason: `${deliveredUtterances.length} delivered utterance(s) require voice response`,
          });
          return;
        }
      }

      if (action === "stop" && voiceInputActive) {
        if (queue.utterances.length > 0) {
          res.json({
            allowed: false,
            requiredAction: "wait_for_utterance",
            reason: "Must wait for potential voice input before stopping",
          });
          return;
        }
      }

      res.json({
        allowed: true,
      });
    });
  });

  describe("input validation", () => {
    it("should reject invalid action types", async () => {
      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "invalid" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid action. Must be "tool-use" or "stop"',
      });
    });

    it("should reject missing action", async () => {
      const response = await request(app).post("/api/validate-action").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid action. Must be "tool-use" or "stop"',
      });
    });
  });

  describe("tool-use action", () => {
    it("should allow when no utterances exist", async () => {
      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ allowed: true });
    });

    it("should block when pending utterances exist and voice input is active", async () => {
      process.env.VOICE_INPUT_ACTIVE = "true";
      queue.utterances = [
        { id: "1", status: "pending", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.body).toEqual({
        allowed: false,
        requiredAction: "dequeue_utterances",
        reason: "1 pending utterance(s) must be dequeued first",
      });
    });

    it("should allow when voice responses disabled and delivered utterances exist", async () => {
      queue.utterances = [
        { id: "1", status: "delivered", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.body).toEqual({ allowed: true });
    });

    it("should block when voice responses enabled and delivered utterances exist", async () => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
      queue.utterances = [
        { id: "1", status: "delivered", text: "Hello", timestamp: new Date() },
        { id: "2", status: "delivered", text: "World", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.body).toEqual({
        allowed: false,
        requiredAction: "speak",
        reason: "2 delivered utterance(s) require voice response",
      });
    });

    it("should allow when all utterances are responded", async () => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
      queue.utterances = [
        { id: "1", status: "responded", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.body).toEqual({ allowed: true });
    });
  });

  describe("stop action", () => {
    it("should allow when voice input is not active", async () => {
      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "stop" });

      expect(response.body).toEqual({ allowed: true });
    });

    it("should allow when voice input is active but no utterances exist", async () => {
      process.env.VOICE_INPUT_ACTIVE = "true";
      queue.utterances = [];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "stop" });

      expect(response.body).toEqual({ allowed: true });
    });

    it("should block when voice input is active and utterances exist", async () => {
      process.env.VOICE_INPUT_ACTIVE = "true";
      queue.utterances = [
        { id: "1", status: "responded", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "stop" });

      expect(response.body).toEqual({
        allowed: false,
        requiredAction: "wait_for_utterance",
        reason: "Must wait for potential voice input before stopping",
      });
    });

    it("should block with pending utterances when voice input is active", async () => {
      process.env.VOICE_INPUT_ACTIVE = "true";
      queue.utterances = [
        { id: "1", status: "pending", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "stop" });

      expect(response.body).toEqual({
        allowed: false,
        requiredAction: "dequeue_utterances",
        reason: "1 pending utterance(s) must be dequeued first",
      });
    });

    it("should prioritize speak over wait when voice enabled", async () => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
      queue.utterances = [
        { id: "1", status: "delivered", text: "Hello", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "stop" });

      expect(response.body).toEqual({
        allowed: false,
        requiredAction: "speak",
        reason: "1 delivered utterance(s) require voice response",
      });
    });
  });

  describe("action priority", () => {
    it("should prioritize dequeue over speak", async () => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
      process.env.VOICE_INPUT_ACTIVE = "true";
      queue.utterances = [
        { id: "1", status: "pending", text: "Hello", timestamp: new Date() },
        { id: "2", status: "delivered", text: "World", timestamp: new Date() },
      ];

      const response = await request(app)
        .post("/api/validate-action")
        .send({ action: "tool-use" });

      expect(response.body.requiredAction).toBe("dequeue_utterances");
    });
  });
});
