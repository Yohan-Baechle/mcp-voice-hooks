interface Hook {
    type: string;
    command: string;
}
interface HookConfig {
    matcher: string;
    hooks: Hook[];
}
interface HookSettings {
    [hookType: string]: HookConfig[];
}
declare function removeVoiceHooks(hooks?: HookSettings): HookSettings;
declare function replaceVoiceHooks(existingHooks: HookSettings | undefined, voiceHooks: HookSettings): HookSettings;
declare function areHooksEqual(hooks1?: HookSettings, hooks2?: HookSettings): boolean;

export { type HookSettings, areHooksEqual, removeVoiceHooks, replaceVoiceHooks };
