export const EVENTS = {
    userPromptSubmit: "UserPromptSubmit",
    stop: "Stop",
    preCompact: "PreCompact",
} as const;

export type HookEvent = (typeof EVENTS)[keyof typeof EVENTS];

export interface HookPayload {
    session_id?: string;
    transcript_path?: string | null;
    cwd?: string;
    prompt?: string;
    hook_event_name?: string;
    [key: string]: unknown;
}
