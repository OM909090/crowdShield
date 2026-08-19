import { ENDPOINTS } from "@crowdshield/config";
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

const DEFAULT_TIMEOUT_MS = 90_000;

/** Extract the payloads from one `\n\n`-delimited SSE frame. */
function payloadOf(frame: string): string {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
}

/**
 * Stream one answer. Resolves with the full text once the server is done, or
 * with whatever arrived before the caller aborted — an abort is a user action
 * (they pressed Stop), not an error to report.
 */
export function streamAssistant(options: AssistantStreamOptions): Promise<{ content: string }> {
  const { baseUrl, session, input, onDelta, onError, signal } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let content = "";
    // How much of `responseText` we have already turned into frames.
    let consumed = 0;
    let finished = false;
    let aborted = false;

    const append = (text: string) => {
      if (!text) return;
      content += text;
      onDelta(text);
    };

    const handleFrame = (frame: string) => {
      const payload = payloadOf(frame);
      if (!payload) return;
      let event: { type?: string; text?: string; message?: string };
      try {
        event = JSON.parse(payload) as typeof event;
      } catch {
        return; // keep-alive or partial JSON — ignore
      }
      if (event.type === "delta") {
        append(typeof event.text === "string" ? event.text : "");
      } else if (event.type === "done") {
        finished = true;
      } else if (event.type === "error") {
        const message = event.message || "The assistant hit an error.";
        // Surface it in the bubble as well as to the handler: the server writes
        // these to be read by the user ("An authority can set it up in Settings").
        append(message);
        onError?.(message);
        finished = true;
      }
    };

    /** Turn any newly-arrived text into whole frames, keeping the partial tail. */
    const drain = (buffer: string) => {
      let rest = buffer.slice(consumed);
      if (!rest) return;
      const frames = rest.split(/\r?\n\r?\n/);
      // The last piece may be incomplete; leave it for the next progress event.
      const tail = frames.pop() ?? "";
      for (const frame of frames) {
        handleFrame(frame);
        if (finished) break;
      }
      consumed = buffer.length - tail.length;
    };

    void (async () => {
      const headers = await session.headers();

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl.replace(/\/+$/, "")}${ENDPOINTS.ai.assistantAsk}`, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "text/event-stream");
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      // Browsers need this to send the auth cookie; harmless on native, where the
      // Cookie header was set explicitly above.
      xhr.withCredentials = session.credentials === "include";
      xhr.timeout = timeoutMs;

      const stop = () => {
        aborted = true;
        try {
          xhr.abort();
        } catch {
          /* already finished */
        }
      };
      signal?.addEventListener("abort", stop);

      const cleanup = () => signal?.removeEventListener("abort", stop);

      xhr.onprogress = () => drain(xhr.responseText ?? "");

      xhr.onload = () => {
        cleanup();
        drain(xhr.responseText ?? "");
        if (xhr.status >= 400 && !content) {
          // The route failed outright (401, 403, 500) — no frames were sent.
          const message =
            xhr.status === 401
              ? "Please sign in again to use the assistant."
              : "The assistant is unavailable right now. Please try again.";
          append(message);
          onError?.(message);
        }
        resolve({ content });
      };

      xhr.onerror = () => {
        cleanup();
        if (aborted) return resolve({ content });
        if (content) return resolve({ content }); // keep the partial answer
        reject(new Error("No connection. Check your network and try again."));
      };

      xhr.ontimeout = () => {
        cleanup();
        if (content) return resolve({ content });
        reject(new Error("The assistant took too long to answer."));
      };

      xhr.onabort = () => {
        cleanup();
        resolve({ content });
      };

      xhr.send(JSON.stringify(input));
    })().catch(reject);
  });
}
