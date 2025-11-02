import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("Settings Migration", () => {
  const testDir = path.join(process.cwd(), "test-project");
  const claudeDir = path.join(testDir, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");
  const settingsLocalPath = path.join(claudeDir, "settings.local.json");
  const cliPath = path.join(process.cwd(), "bin", "cli.js");

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe("install-hooks", () => {
    it("should create settings.local.json when no settings exist", () => {
      execSync(`node ${cliPath} install-hooks`, { cwd: testDir });

      expect(fs.existsSync(settingsLocalPath)).toBe(true);
      expect(fs.existsSync(settingsPath)).toBe(false);

      const settings = JSON.parse(fs.readFileSync(settingsLocalPath, "utf8"));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.Stop).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.PostToolUse).toBeDefined();
    });

    it("should migrate hooks from settings.json to settings.local.json", () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      const oldSettings = {
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: ".*",
              hooks: [
                {
                  type: "command",
                  command: "echo 'custom hook'",
                },
              ],
            },
            {
              matcher: "^(?!mcp__voice-hooks__).*",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/pre-tool" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(oldSettings, null, 2));

      execSync(`node ${cliPath} install-hooks`, { cwd: testDir });

      const cleanedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      expect(cleanedSettings.hooks?.Stop).toBeUndefined();
      expect(cleanedSettings.hooks?.PreToolUse).toBeDefined();
      expect(cleanedSettings.hooks.PreToolUse.length).toBe(1);
      expect(cleanedSettings.hooks.PreToolUse[0].hooks[0].command).toBe(
        "echo 'custom hook'"
      );

      const newSettings = JSON.parse(
        fs.readFileSync(settingsLocalPath, "utf8")
      );
      expect(newSettings.hooks).toBeDefined();
      expect(newSettings.hooks.Stop).toBeDefined();
      expect(newSettings.hooks.PreToolUse).toBeDefined();
      expect(newSettings.hooks.PostToolUse).toBeDefined();
    });

    it("should preserve custom hooks in settings.json when migrating", () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      const oldSettings = {
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "^custom-tool$",
              hooks: [
                {
                  type: "command",
                  command: "echo 'custom hook'",
                },
              ],
            },
            {
              matcher: "^(?!mcp__voice-hooks__).*",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/pre-tool" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(oldSettings, null, 2));

      execSync(`node ${cliPath} install-hooks`, { cwd: testDir });

      const cleanedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      expect(cleanedSettings.hooks.PreToolUse).toBeDefined();
      expect(cleanedSettings.hooks.PreToolUse.length).toBe(1);
      expect(cleanedSettings.hooks.PreToolUse[0].matcher).toBe("^custom-tool$");
      expect(cleanedSettings.hooks.Stop).toBeUndefined();
    });

    it("should update existing settings.local.json hooks", () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      const existingSettings = {
        env: { PORT: "3000" },
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    "curl -s -X POST \"http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop\" || echo 'old version'",
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(
        settingsLocalPath,
        JSON.stringify(existingSettings, null, 2)
      );

      execSync(`node ${cliPath} install-hooks`, { cwd: testDir });

      const updatedSettings = JSON.parse(
        fs.readFileSync(settingsLocalPath, "utf8")
      );
      expect(updatedSettings.env.PORT).toBe("3000");
      expect(updatedSettings.hooks.Stop[0].hooks[0].command).toContain(
        "voice-hooks not running"
      );
      expect(updatedSettings.hooks.PreToolUse).toBeDefined();
      expect(updatedSettings.hooks.PostToolUse).toBeDefined();
    });
  });

  describe("uninstall", () => {
    it("should remove hooks from both settings files", () => {
      fs.mkdirSync(claudeDir, { recursive: true });

      const settings = {
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const settingsLocal = {
        env: { PORT: "3000" },
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "^(?!mcp__voice-hooks__).*",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/pre-tool" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(
        settingsLocalPath,
        JSON.stringify(settingsLocal, null, 2)
      );

      execSync(`node ${cliPath} uninstall`, { cwd: testDir });

      const cleanedSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      expect(cleanedSettings.hooks).toBeUndefined();

      const cleanedSettingsLocal = JSON.parse(
        fs.readFileSync(settingsLocalPath, "utf8")
      );
      expect(cleanedSettingsLocal.env.PORT).toBe("3000");
      expect(cleanedSettingsLocal.hooks).toBeUndefined();
    });

    it("should handle missing settings files gracefully", () => {
      const output = execSync(`node ${cliPath} uninstall`, {
        cwd: testDir,
        encoding: "utf8",
      });

      expect(output).toContain("No Claude settings files found");
      expect(output).toContain("Uninstallation complete");
    });

    it("should preserve custom hooks during uninstall", () => {
      fs.mkdirSync(claudeDir, { recursive: true });
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: "^custom-tool$",
              hooks: [
                {
                  type: "command",
                  command: "echo 'custom hook'",
                },
              ],
            },
            {
              matcher: "^(?!mcp__voice-hooks__).*",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/pre-tool" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    'curl -s -X POST "http://localhost:${MCP_VOICE_HOOKS_PORT:-5111}/api/hooks/stop" || echo \'{"decision": "approve", "reason": "voice-hooks not running"}\'',
                },
              ],
            },
          ],
        },
      };
      fs.writeFileSync(settingsLocalPath, JSON.stringify(settings, null, 2));

      execSync(`node ${cliPath} uninstall`, { cwd: testDir });

      const cleanedSettings = JSON.parse(
        fs.readFileSync(settingsLocalPath, "utf8")
      );
      expect(cleanedSettings.hooks.PreToolUse).toBeDefined();
      expect(cleanedSettings.hooks.PreToolUse.length).toBe(1);
      expect(cleanedSettings.hooks.PreToolUse[0].matcher).toBe("^custom-tool$");
      expect(cleanedSettings.hooks.Stop).toBeUndefined();
    });
  });
});
