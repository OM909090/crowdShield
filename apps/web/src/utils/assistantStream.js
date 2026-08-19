import api from "./axios";

/**
 * SSE client for the conversational assistant popup.
 *
 * POSTs to `{baseURL}/ai/assistant/ask` and reads a `text/event-stream`
 * response. Each frame is a line `data: <json>\n\n` where <json> is one of:
 *   { type: "delta", text }    -> stream token, appended + surfaced via onDelta
 *   { type: "done" }           -> stream complete
 *   { type: "error", message } -> surfaced via onDelta, then stream ends
 * Unknown types (and non-JSON keep-alive comments) are ignored gracefully.
 *
 * Auth rides on the httpOnly cookies, so the fetch uses credentials:"include"
 * (mirrors the axios `withCredentials` config). The base URL is resolved from
 * the shared axios instance so it always matches app config.
 *
 * @param {object}   opts
 * @param {string}   opts.message   the user's prompt
 * @param {string=}  opts.eventId   event scope (optional)
 * @param {Array=}   opts.history   prior turns [{ role, content }]
 * @param {number=}  opts.lat       the citizen's latitude, when they share location
 * @param {number=}  opts.lng       the citizen's longitude
 * @param {number=}  opts.heading   compass heading in degrees, when the device reports it
 * @param {string=}  opts.lang      app language ("en" | "hi" | "or") for the reply
 * @param {(t:string)=>void} opts.onDelta  called with each streamed chunk
 * @param {AbortSignal=} opts.signal        wired to the Stop button
 * @returns {Promise<{ content: string }>}  the fully accumulated reply
 */
export async function askAssistant({
  message,
  eventId,
  history,
  lat,
  lng,
  heading,
  lang,
  onDelta,
  signal,
} = {}) {
  const base = (api.defaults.baseURL || "").replace(/\/+$/, "");

  let content = "";
  const append = (text) => {
    if (typeof text !== "string" || !text) return;
    content += text;
    if (typeof onDelta === "function") onDelta(text);
  };

  // --- open the stream ---------------------------------------------------
  let res;
  try {
    res = await fetch(`${base}/ai/assistant/ask`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, eventId, history, lat, lng, heading, lang }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") return { content }; // user hit Stop — quiet
    throw err; // genuine network failure -> caller shows its error bubble
  }

  // Server reachable but unhappy (or no stream body): soft, shown fallback.
  if (!res.ok || !res.body) {
    append("The assistant is unavailable right now. Please try again.");
    return { content };
  }

  // --- parse the SSE frames ---------------------------------------------
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  const handleFrame = (frame) => {
    // A frame may carry several `data:` lines; concatenate their payloads.
    const payload = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
      .trim();
    if (!payload) return;

    let evt;
    try {
      evt = JSON.parse(payload);
    } catch {
      return; // non-JSON comment / keep-alive — ignore
    }
    if (!evt || typeof evt !== "object") return;

    if (evt.type === "delta") {
      append(typeof evt.text === "string" ? evt.text : "");
    } else if (evt.type === "done") {
      done = true;
    } else if (evt.type === "error") {
      append(typeof evt.message === "string" && evt.message ? evt.message : "The assistant hit an error.");
      done = true;
    }
    // any other type is ignored gracefully
  };

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; keep the trailing partial.
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        handleFrame(frame);
        if (done) break;
      }
    }
    // Flush anything the server left without a final blank line.
    if (!done) {
      buffer += decoder.decode();
      if (buffer.trim()) handleFrame(buffer);
    }
  } catch (err) {
    if (err?.name === "AbortError") return { content }; // Stop — keep partial, quiet
    if (!content) throw err; // nothing streamed yet -> surface as an error
    // otherwise keep the partial reply we already showed the user
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* reader already closed/released — nothing to clean up */
    }
  }

  return { content };
}
