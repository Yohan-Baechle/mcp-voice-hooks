import request from "supertest";
import express from "express";

describe("conversation flow tracking", () => {
  let app: express.Application;
  let queue: any;
  let lastToolUseTimestamp: Date | null;
  let lastSpeakTimestamp: Date | null;
  let voicePreferences: any;

  beforeEach(() => {
    delete process.env.VOICE_RESPONSES_ENABLED;
    lastToolUseTimestamp = null;
    lastSpeakTimestamp = null;
    voicePreferences = {
      voiceResponsesEnabled: false,
      voiceInputActive: false,
    };

    queue = {
      utterances: [],
    };

    app = express();
    app.use(express.json());

    app.post("/api/hooks/pre-wait", (req, res) => {
      const voiceResponsesEnabled =
        process.env.VOICE_RESPONSES_ENABLED === "true";

      const pendingUtterances = queue.utterances.filter(
        (u: any) => u.status === "pending"
      );
      if (pendingUtterances.length > 0) {
        res.json({
          decision: "block",
          reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`,
        });
        return;
      }

      if (voiceResponsesEnabled) {
        const deliveredUtterances = queue.utterances.filter(
          (u: any) => u.status === "delivered"
        );
        if (deliveredUtterances.length > 0) {
          res.json({
            decision: "block",
            reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
          });
          return;
        }
      }

      if (
        voiceResponsesEnabled &&
        lastToolUseTimestamp &&
        (!lastSpeakTimestamp || lastSpeakTimestamp < lastToolUseTimestamp)
      ) {
        res.json({
          decision: "block",
          reason:
            "Assistant must speak after using tools. Please use the speak tool to respond before waiting for utterances.",
        });
        return;
      }

      res.json({
        decision: "approve",
      });
    });

    app.post("/api/hooks/stop", (req, res) => {
      const voiceResponsesEnabled =
        process.env.VOICE_RESPONSES_ENABLED === "true";

      const pendingUtterances = queue.utterances.filter(
        (u: any) => u.status === "pending"
      );
      if (pendingUtterances.length > 0) {
        res.json({
          decision: "block",
          reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`,
        });
        return;
      }

      if (voiceResponsesEnabled) {
        const deliveredUtterances = queue.utterances.filter(
          (u: any) => u.status === "delivered"
        );
        if (deliveredUtterances.length > 0) {
          res.json({
            decision: "block",
            reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`,
          });
          return;
        }
      }

      if (
        voiceResponsesEnabled &&
        lastToolUseTimestamp &&
        (!lastSpeakTimestamp || lastSpeakTimestamp < lastToolUseTimestamp)
      ) {
        res.json({
          decision: "block",
          reason:
            "Assistant must speak after using tools. Please use the speak tool to respond before proceeding.",
        });
        return;
      }

      if (voicePreferences.voiceInputActive) {
        res.json({
          decision: "block",
          reason:
            "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
        });
        return;
      }

      res.json({
        decision: "approve",
      });
    });

    app.post("/api/speak", (req, res) => {
      const { text } = req.body;

      if (!text || !text.trim()) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const deliveredUtterances = queue.utterances.filter(
        (u: any) => u.status === "delivered"
      );
      deliveredUtterances.forEach((u: any) => {
        u.status = "responded";
      });

      lastSpeakTimestamp = new Date();

      res.json({
        success: true,
        message: "Text spoken successfully",
        respondedCount: deliveredUtterances.length,
      });
    });

    app.delete("/api/utterances", (req, res) => {
      const clearedCount = queue.utterances.length;
      queue.utterances = [];

      res.json({
        success: true,
        message: `Cleared ${clearedCount} utterances`,
        clearedCount,
      });
    });
  });

  describe("tool usage tracking", () => {
    it("should track speak timestamp when speak is called", async () => {
      expect(lastSpeakTimestamp).toBeNull();

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "Hello" });

      expect(response.status).toBe(200);
      expect(lastSpeakTimestamp).not.toBeNull();
      expect(lastSpeakTimestamp).toBeInstanceOf(Date);
    });
  });

  describe("pre-wait hook with voice responses enabled", () => {
    beforeEach(() => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
    });

    it("should block wait_for_utterance when not spoken after tool use", async () => {
      lastToolUseTimestamp = new Date();

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "Assistant must speak after using tools. Please use the speak tool to respond before waiting for utterances.",
      });
    });

    it("should allow wait_for_utterance after speaking", async () => {
      lastToolUseTimestamp = new Date();

      await request(app)
        .post("/api/speak")
        .send({ text: "Response to tool action" });

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({ decision: "approve" });
    });

    it("should allow wait_for_utterance when no tool was used", async () => {
      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({ decision: "approve" });
    });

    it("should block for pending utterances first", async () => {
      queue.utterances.push({
        id: "1",
        text: "Pending",
        timestamp: new Date(),
        status: "pending",
      });

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "1 pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.",
      });
    });

    it("should block for delivered utterances before tool use check", async () => {
      lastToolUseTimestamp = new Date();

      queue.utterances.push({
        id: "1",
        text: "Delivered",
        timestamp: new Date(),
        status: "delivered",
      });

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "1 delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.",
      });
    });
  });

  describe("stop hook with voice responses enabled", () => {
    beforeEach(() => {
      process.env.VOICE_RESPONSES_ENABLED = "true";
    });

    it("should block stop when not spoken after tool use", async () => {
      lastToolUseTimestamp = new Date();

      const response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "Assistant must speak after using tools. Please use the speak tool to respond before proceeding.",
      });
    });

    it("should allow stop when spoken after tool use and voice input is not active", async () => {
      lastToolUseTimestamp = new Date();

      await request(app).post("/api/speak").send({ text: "Response" });

      const response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body).toEqual({
        decision: "approve",
      });
    });

    it("should allow stop when all conditions are met", async () => {
      lastToolUseTimestamp = new Date();

      await request(app).post("/api/speak").send({ text: "Response" });

      voicePreferences.voiceInputActive = true;

      const response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
      });
    });
  });

  describe("pre-wait hook with voice responses disabled", () => {
    it("should not enforce speak-after-tool-use when voice disabled", async () => {
      lastToolUseTimestamp = new Date();

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({ decision: "approve" });
    });

    it("should not check for delivered utterances when voice disabled", async () => {
      queue.utterances.push({
        id: "1",
        text: "Delivered",
        timestamp: new Date(),
        status: "delivered",
      });

      const response = await request(app).post("/api/hooks/pre-wait").send({});

      expect(response.body).toEqual({ decision: "approve" });
    });
  });

  describe("queue clearing and stop hook interaction", () => {
    it("should block stop after clearing queue and adding new utterances", async () => {
      voicePreferences.voiceInputActive = true;

      lastToolUseTimestamp = new Date();

      await request(app).post("/api/speak").send({ text: "Response" });

      let response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body.decision).toBe("block");

      await request(app).delete("/api/utterances").send({});

      queue.utterances.push({
        id: "1",
        text: "New utterance after clear",
        timestamp: new Date(),
        status: "pending",
      });

      response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "1 pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.",
      });
    });

    it("should require wait_for_utterance after clearing queue even without pending utterances", async () => {
      voicePreferences.voiceInputActive = true;

      lastToolUseTimestamp = new Date();

      await request(app).post("/api/speak").send({ text: "Response" });

      await request(app).delete("/api/utterances").send({});

      const response = await request(app).post("/api/hooks/stop").send({});

      expect(response.body).toEqual({
        decision: "block",
        reason:
          "Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input",
      });
    });
  });
});
