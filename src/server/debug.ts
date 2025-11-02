const DEBUG =
  process.env.DEBUG === "true" || process.env.VOICE_HOOKS_DEBUG === "true";

export function debugLog(...args: any[]): void {
  if (DEBUG) {
    console.log(...args);
  }
}
