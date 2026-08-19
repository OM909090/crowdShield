/**
 * llmProvider — the OpenAI-compatible inference client.
 *
 * This is the single seam between CrowdShield and whatever LLM endpoint the
 * operator configured (OpenAI, Together, Groq, a local Ollama/LM Studio, ...).
 * The AI agent layer (built later) depends on the exported functions below as a
 * stable contract:
 *
 *   NoProviderError                          — thrown when no usable provider
 *   getActiveConfig()                        — { baseUrl, apiKey, model, label, status } | null
 *   listModels({ baseUrl, apiKey })          — Array<{ id }>
 *   chat({ messages, model, ... })           — { content, toolCalls?, finishReason?, raw }
 *   chatStream({ messages, onDelta, ... })   — { content, toolCalls?, finishReason? }
 *
 * Config resolution: chat/chatStream accept an explicit { baseUrl, apiKey,
 * model }. Any field left `undefined` is filled from the stored singleton via
 * getActiveConfig(). If, after that, there's still no baseUrl/model, they throw
 * NoProviderError. Passing an explicit empty string is treated as "no value"
 * and fails fast WITHOUT touching the database — keeping the no-provider path
 * cheap and testable.
 *
 * Uses the global fetch (Node 18+). No external HTTP dependencies.
 */
import ProviderConfig, { getSingleton } from "../models/ProviderConfig.js";
import { decryptSecret } from "../utils/cryptoBox.js";

// Keep a reference so bundlers/linters don't flag the default import as unused;
// getSingleton() is the primary accessor but importing the model guarantees the
// schema is registered before we query it.
void ProviderConfig;

const REQUEST_TIMEOUT_MS = 10_000;

/** Raised when a chat/stream is attempted with no configured provider. */
export class NoProviderError extends Error {
  constructor(message = "No LLM provider is configured") {
    super(message);
    this.name = "NoProviderError";
    this.code = "NO_PROVIDER";
  }
}

/** Strip trailing slashes so URL joins are predictable. */
const trimBase = (u) => String(u || "").trim().replace(/\/+$/, "");

/** Tag + throw a listModels error with a machine-readable `.kind`. */
function providerError(kind, message, cause) {
  const err = new Error(message);
  err.kind = kind; // "auth" | "unreachable" | "bad_response"
  if (cause) err.cause = cause;
  return err;
}

/** Best-effort read of an error body for context (bounded). */
async function safeText(response) {
  try {
    const text = await response.text();
    return text ? text.slice(0, 500) : "";
  } catch {
    return "";
  }
}

/**
 * Load and decrypt the stored provider config.
 * @returns {Promise<{ baseUrl, apiKey, model, label, status } | null>}
 */
export async function getActiveConfig() {
  const doc = await getSingleton().select("+apiKeyEnc");
  if (!doc || !doc.baseUrl) return null;

  let apiKey = "";
  if (doc.apiKeyEnc) {
    try {
      apiKey = decryptSecret(doc.apiKeyEnc);
    } catch {
      // Stored key is unreadable (e.g. the env secret was rotated). Treat as
      // keyless rather than crashing; callers can re-enter the key.
      apiKey = "";
    }
  }

  return {
    baseUrl: doc.baseUrl,
    apiKey,
    model: doc.model || "",
    label: doc.label || "",
    status: doc.status || "unconfigured",
  };
}

/**
 * Resolve an effective { baseUrl, apiKey, model }, filling any field left
 * `undefined` from the stored singleton. Throws NoProviderError if baseUrl or
 * model end up empty.
 *
 * We only hit the DB when a field is literally `undefined`; explicit empty
 * strings short-circuit to NoProviderError so the "nothing configured" path
 * never requires a Mongo connection.
 */
async function resolveConfig(input = {}) {
  const provided = {
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
  };

  const mustLookup =
    provided.baseUrl === undefined ||
    provided.apiKey === undefined ||
    provided.model === undefined;

  const active = mustLookup ? await getActiveConfig() : null;

  const baseUrl = provided.baseUrl !== undefined ? provided.baseUrl : active?.baseUrl;
  const apiKey = provided.apiKey !== undefined ? provided.apiKey : active?.apiKey;
  const model = provided.model !== undefined ? provided.model : active?.model;

  if (!baseUrl) throw new NoProviderError("No LLM provider base URL is configured");
  if (!model) throw new NoProviderError("No model is selected for the LLM provider");

  return { baseUrl: trimBase(baseUrl), apiKey: apiKey || "", model };
}

/**
 * List the models a provider exposes.
 * @param {{ baseUrl: string, apiKey?: string }} args
 * @returns {Promise<Array<{ id: string }>>} sorted by id
 * @throws Error with `.kind` of "auth" | "unreachable" | "bad_response"
 */
export async function listModels({ baseUrl, apiKey } = {}) {
  if (!baseUrl) throw providerError("bad_response", "A base URL is required to list models");

  const url = `${trimBase(baseUrl)}/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    // Network failure, DNS error, or our abort timeout all land here.
    const reason = err?.name === "AbortError" ? "timed out" : "could not be reached";
    throw providerError("unreachable", `The provider ${reason} at ${trimBase(baseUrl)}`, err);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw providerError("auth", "The provider rejected the API key (unauthorized)");
  }
  if (!response.ok) {
    const detail = await safeText(response);
    throw providerError(
      "bad_response",
      `The provider returned HTTP ${response.status} when listing models${detail ? `: ${detail}` : ""}`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw providerError("bad_response", "The provider's model list was not valid JSON", err);
  }

  // Accept OpenAI's { data: [...] } as well as a bare array.
  const rawList = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
  if (!rawList) {
    throw providerError("bad_response", "The provider did not return a list of models");
  }

  return rawList
    .map((m) => {
      if (typeof m === "string") return { id: m };
      if (m && (m.id ?? m.name)) return { id: String(m.id ?? m.name) };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * POST a chat request, turning transport failures into an actionable error.
 *
 * Node's HTTP client gives up if a provider sends no response headers within
 * ~300s. A slow endpoint (a CPU-only local model, or a hosted model under load)
 * hits that and surfaces only an opaque "fetch failed", which tells an operator
 * nothing. We translate it into a typed PROVIDER_TIMEOUT with advice instead.
 */
async function sendChatRequest(url, cfg, { accept, body, signal }) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const cause = err?.cause?.code || err?.code;
    const timedOut =
      cause === "UND_ERR_HEADERS_TIMEOUT" ||
      cause === "UND_ERR_BODY_TIMEOUT" ||
      cause === "ETIMEDOUT" ||
      err?.name === "TimeoutError";

    if (timedOut) {
      const e = new Error(
        "The model did not respond in time. It may be too slow for this workload " +
          "(a CPU-only local model, or a busy endpoint). Try a faster/smaller model " +
          "or a hosted provider in Settings → AI Provider."
      );
      e.code = "PROVIDER_TIMEOUT";
      e.kind = "unreachable";
      e.cause = err;
      throw e;
    }
    if (err?.name === "AbortError") throw err; // caller cancelled — propagate as-is

    const e = new Error(`Could not reach the model provider at ${cfg.baseUrl}: ${err.message}`);
    e.code = "PROVIDER_UNREACHABLE";
    e.kind = "unreachable";
    e.cause = err;
    throw e;
  }
}

/** Assemble the request body shared by chat and chatStream. */
function buildChatBody({ model, messages, tools, temperature, maxTokens, stream }) {
  const payload = {
    model,
    messages: Array.isArray(messages) ? messages : [],
    stream,
  };
  if (Number.isFinite(temperature)) payload.temperature = temperature;
  if (Number.isFinite(maxTokens)) payload.max_tokens = maxTokens;
  if (Array.isArray(tools) && tools.length) payload.tools = tools;
  return payload;
}

/**
 * Non-streaming chat completion.
 * @returns {Promise<{ content: string, toolCalls?: Array, finishReason?: string, raw: any }>}
 */
export async function chat({
  messages,
  model,
  tools,
  temperature,
  maxTokens,
  signal,
  baseUrl,
  apiKey,
} = {}) {
  const cfg = await resolveConfig({ baseUrl, apiKey, model });
  const url = `${cfg.baseUrl}/chat/completions`;

  const response = await sendChatRequest(url, cfg, {
    accept: "application/json",
    body: buildChatBody({ model: cfg.model, messages, tools, temperature, maxTokens, stream: false }),
    signal,
  });

  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(
      `Chat request failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const raw = await response.json();
  const choice = raw?.choices?.[0] || {};
  const message = choice.message || {};

  return {
    content: typeof message.content === "string" ? message.content : "",
    ...(Array.isArray(message.tool_calls) && message.tool_calls.length
      ? { toolCalls: message.tool_calls }
      : {}),
    finishReason: choice.finish_reason,
    raw,
  };
}

/**
 * Streaming chat completion (SSE). Calls onDelta(textChunk) as content arrives
 * and returns the fully assembled result once the stream closes.
 * @returns {Promise<{ content: string, toolCalls?: Array, finishReason?: string }>}
 */
export async function chatStream({
  messages,
  model,
  tools,
  temperature,
  maxTokens,
  signal,
  onDelta,
  baseUrl,
  apiKey,
} = {}) {
  const cfg = await resolveConfig({ baseUrl, apiKey, model });
  const url = `${cfg.baseUrl}/chat/completions`;

  const response = await sendChatRequest(url, cfg, {
    accept: "text/event-stream",
    body: buildChatBody({ model: cfg.model, messages, tools, temperature, maxTokens, stream: true }),
    signal,
  });

  if (!response.ok) {
    const detail = await safeText(response);
    throw new Error(
      `Chat stream failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
    );
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("Streaming is not supported by this runtime or response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let finishReason;
  const toolCallsByIndex = new Map();

  const handlePayload = (payload) => {
    const data = payload.trim();
    if (!data || data === "[DONE]") return;

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return; // ignore keep-alives / partial noise
    }

    const choice = json?.choices?.[0];
    if (!choice) return;

    const delta = choice.delta || {};
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      if (typeof onDelta === "function") {
        try {
          onDelta(delta.content);
        } catch {
          // A consumer's onDelta error must not tear down the stream.
        }
      }
    }

    // Tool calls arrive fragmented across chunks, keyed by `index`. Accumulate
    // the name once and append argument fragments in arrival order.
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = Number.isInteger(tc.index) ? tc.index : 0;
        const acc =
          toolCallsByIndex.get(idx) ||
          { index: idx, id: undefined, type: "function", function: { name: "", arguments: "" } };
        if (tc.id) acc.id = tc.id;
        if (tc.type) acc.type = tc.type;
        if (tc.function?.name) acc.function.name = tc.function.name;
        if (typeof tc.function?.arguments === "string") {
          acc.function.arguments += tc.function.arguments;
        }
        toolCallsByIndex.set(idx, acc);
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  // Split the buffer on newlines, processing only complete lines and leaving
  // any trailing partial line in `buffer` for the next read.
  const drainLines = () => {
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1); // tolerate CRLF
      if (!line || line.startsWith(":")) continue; // blank line / SSE comment
      if (line.startsWith("data:")) handlePayload(line.slice(5));
      // event:/id: fields are irrelevant for chat completions
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drainLines();
  }
  buffer += decoder.decode(); // flush any multibyte remainder
  drainLines();

  const toolCalls = toolCallsByIndex.size
    ? [...toolCallsByIndex.values()].sort((a, b) => a.index - b.index)
    : undefined;

  return { content, ...(toolCalls ? { toolCalls } : {}), finishReason };
}

export default { NoProviderError, getActiveConfig, listModels, chat, chatStream };
