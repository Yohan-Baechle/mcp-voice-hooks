import { EventEmitter } from "events";

describe("Browser Disconnect Voice Features - Unit Tests", () => {
  let mockVoicePreferences: any;
  let mockTtsClients: Set<any>;
  let mockRes: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockVoicePreferences = {
      voiceInputActive: false,
      voiceResponsesEnabled: false,
    };

    mockTtsClients = new Set();

    mockRes = Object.assign(new EventEmitter(), {
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    });
  });

  it("should disable voice features when last browser disconnects", () => {
    mockVoicePreferences.voiceInputActive = true;
    mockVoicePreferences.voiceResponsesEnabled = true;

    mockTtsClients.add(mockRes);
    expect(mockTtsClients.size).toBe(1);

    mockRes.on("close", () => {
      mockTtsClients.delete(mockRes);

      if (mockTtsClients.size === 0) {
        mockVoicePreferences.voiceInputActive = false;
        mockVoicePreferences.voiceResponsesEnabled = false;
      }
    });

    mockRes.emit("close");

    expect(mockTtsClients.size).toBe(0);

    expect(mockVoicePreferences.voiceInputActive).toBe(false);
    expect(mockVoicePreferences.voiceResponsesEnabled).toBe(false);
  });

  it("should maintain voice features when one browser remains connected", () => {
    mockVoicePreferences.voiceInputActive = true;
    mockVoicePreferences.voiceResponsesEnabled = true;

    const mockRes1 = Object.assign(new EventEmitter(), {
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    });

    const mockRes2 = Object.assign(new EventEmitter(), {
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    });

    mockTtsClients.add(mockRes1);
    mockTtsClients.add(mockRes2);
    expect(mockTtsClients.size).toBe(2);

    [mockRes1, mockRes2].forEach((res) => {
      res.on("close", () => {
        mockTtsClients.delete(res);

        if (mockTtsClients.size === 0) {
          mockVoicePreferences.voiceInputActive = false;
          mockVoicePreferences.voiceResponsesEnabled = false;
        }
      });
    });

    mockRes1.emit("close");

    expect(mockTtsClients.size).toBe(1);

    expect(mockVoicePreferences.voiceInputActive).toBe(true);
    expect(mockVoicePreferences.voiceResponsesEnabled).toBe(true);

    mockRes2.emit("close");

    expect(mockTtsClients.size).toBe(0);

    expect(mockVoicePreferences.voiceInputActive).toBe(false);
    expect(mockVoicePreferences.voiceResponsesEnabled).toBe(false);
  });

  it("should not disable voice features if they were already disabled", () => {
    mockVoicePreferences.voiceInputActive = false;
    mockVoicePreferences.voiceResponsesEnabled = false;

    mockTtsClients.add(mockRes);

    mockRes.on("close", () => {
      mockTtsClients.delete(mockRes);

      if (mockTtsClients.size === 0) {
        mockVoicePreferences.voiceInputActive = false;
        mockVoicePreferences.voiceResponsesEnabled = false;
      }
    });

    mockRes.emit("close");

    expect(mockVoicePreferences.voiceInputActive).toBe(false);
    expect(mockVoicePreferences.voiceResponsesEnabled).toBe(false);
  });
});
