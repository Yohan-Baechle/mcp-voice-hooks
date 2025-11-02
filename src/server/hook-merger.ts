interface Hook {
  type: string;
  command: string;
}

interface HookConfig {
  matcher: string;
  hooks: Hook[];
}

export interface HookSettings {
  [hookType: string]: HookConfig[];
}

export function removeVoiceHooks(hooks: HookSettings = {}): HookSettings {
  const cleaned: HookSettings = {};
  const voiceHookPattern = /MCP_VOICE_HOOKS_PORT/;

  for (const [hookType, hookArray] of Object.entries(hooks)) {
    cleaned[hookType] = hookArray.filter((hookConfig) => {
      return !hookConfig.hooks.some((hook) =>
        voiceHookPattern.test(hook.command)
      );
    });

    if (cleaned[hookType].length === 0) {
      delete cleaned[hookType];
    }
  }

  return cleaned;
}

export function replaceVoiceHooks(
  existingHooks: HookSettings = {},
  voiceHooks: HookSettings
): HookSettings {
  const cleaned = removeVoiceHooks(existingHooks);
  const result: HookSettings = JSON.parse(JSON.stringify(cleaned));

  for (const [hookType, hookArray] of Object.entries(voiceHooks)) {
    if (!result[hookType]) {
      result[hookType] = hookArray;
    } else {
      result[hookType].push(...hookArray);
    }
  }

  return result;
}

export function areHooksEqual(
  hooks1: HookSettings = {},
  hooks2: HookSettings = {}
): boolean {
  const types1 = Object.keys(hooks1).sort();
  const types2 = Object.keys(hooks2).sort();

  if (types1.join(",") !== types2.join(",")) {
    return false;
  }

  for (const hookType of types1) {
    const configs1 = hooks1[hookType];
    const configs2 = hooks2[hookType];

    if (configs1.length !== configs2.length) {
      return false;
    }

    const normalized1 = configs1.map((config) => JSON.stringify(config)).sort();
    const normalized2 = configs2.map((config) => JSON.stringify(config)).sort();

    for (let i = 0; i < normalized1.length; i++) {
      if (normalized1[i] !== normalized2[i]) {
        return false;
      }
    }
  }

  return true;
}
