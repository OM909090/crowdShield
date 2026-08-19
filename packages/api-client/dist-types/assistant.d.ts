import type { AssistantAskInput } from "@crowdshield/validation";
import type { SessionAdapter } from "./session";
/**
 * Streaming client for `POST /ai/assistant/ask` (Server-Sent Events).
 *
 * Implemented on XMLHttpRequest rather than `fetch`, for one blunt reason: React
 * Native's fetch does not expose `response.body`, so the web client's
 * `getReader()` loop cannot run on a phone. XHR's `responseText` does grow
 * incrementally while a response streams, on both React Native and every browser
 * — so one implementation covers both platforms and neither has to fall back to
 * waiting for the whole answer.
 *
 * Frame format, unchanged from the server:
 *   data: {"type":"delta","text":"…"}   token to append
 *   data: {"type":"done"}               finished
 *   data: {"type":"error","message":"…"} shown to the user, then the stream ends
 */
export interface AssistantStreamOptions {
    readonly baseUrl: string;
    readonly session: SessionAdapter;
    readonly input: AssistantAskInput;
    /** Called with each streamed fragment. */
    readonly onDelta: (text: string) => void;
    /** Server-reported problem, already written to be shown to the user. */
    readonly onError?: (message: string) => void;
    readonly signal?: AbortSignal;
    /** Longest a single answer may take before we give up. */
    readonly timeoutMs?: number;
}
/**
 * Stream one answer. Resolves with the full text once the server is done, or
 * with whatever arrived before the caller aborted — an abort is a user action
 * (they pressed Stop), not an error to report.
 */
export declare function streamAssistant(options: AssistantStreamOptions): Promise<{
    content: string;
}>;
