import request from "supertest";
import express from "express";

describe("Speak Endpoint Integration Tests", () => {
  let app: express.Application;
  let server: any;

  beforeEach(async () => {
    jest.resetModules();

    const { setupApp } = await import("../test-utils/app-setup");
    app = setupApp();

    server = app.listen(0);
  });

  afterEach((done) => {
    server.close(done);
  });

  describe("POST /api/speak", () => {
    it("should return 400 error when voice responses are disabled", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: false })
        .expect(200);

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "Test message" })
        .expect(400);

      expect(response.body).toEqual({
        error: "Voice responses are disabled",
        message: "Cannot speak when voice responses are disabled",
      });
    });

    it("should return 200 success when voice responses are enabled", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      const response = await request(app)
        .post("/api/speak")
        .send({ text: "Test message" })
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty(
        "message",
        "Text spoken successfully"
      );
    });

    it("should return 400 error when text is missing", async () => {
      const response = await request(app)
        .post("/api/speak")
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: "Text is required",
      });
    });

    it("should return 400 error when text is empty", async () => {
      const response = await request(app)
        .post("/api/speak")
        .send({ text: "  " })
        .expect(400);

      expect(response.body).toEqual({
        error: "Text is required",
      });
    });

    it("should handle voice preference state changes correctly", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      await request(app)
        .post("/api/speak")
        .send({ text: "First test" })
        .expect(200);

      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: false })
        .expect(200);

      await request(app)
        .post("/api/speak")
        .send({ text: "Second test" })
        .expect(400);

      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: true })
        .expect(200);

      await request(app)
        .post("/api/speak")
        .send({ text: "Third test" })
        .expect(200);
    });
  });

  describe("POST /api/speak-system", () => {
    it("should always work regardless of voice response setting", async () => {
      await request(app)
        .post("/api/voice-preferences")
        .send({ voiceResponsesEnabled: false })
        .expect(200);

      const response = await request(app)
        .post("/api/speak-system")
        .send({ text: "System test message" })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: "Text spoken successfully via system voice",
      });
    });

    it("should return 400 error when text is missing", async () => {
      const response = await request(app)
        .post("/api/speak-system")
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        error: "Text is required",
      });
    });

    it("should accept custom rate parameter", async () => {
      const response = await request(app)
        .post("/api/speak-system")
        .send({
          text: "Test with custom rate",
          rate: 300,
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: "Text spoken successfully via system voice",
      });
    });
  });
});
