import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Sparkles, Send, X, Minus, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAssistantSituation } from "../../context/assistantSituation";
import { askAssistant } from "../../utils/assistantStream";
import ChatMessage from "./ChatMessage";

/**
 * A citizen and an operator open the same popup with completely different
 * questions. Offering "Should we open or close any gate?" to a member of the
 * public is both useless to them and outside what the assistant will answer.
 */
const PROMPTS = {
  // The control room's actual decisions, in the order they get asked during an
  // incident: is this going bad, where, what do I move, what do I tell people.
  operator: [
    "Is a crush likely in the next few minutes?",
    "Where is a bottleneck forming?",
    "Which gates should I open or close?",
    "Where should I move personnel?",
    "Draft a calm public announcement.",
  ],
  // Shown once a citizen has joined an event and is sharing location.
  citizen: [
    "What's the safest way out from here?",
    "How crowded is it around me?",
    "Which streets should I avoid?",
    "How do I report a blocked route?",
  ],
  // Before they pick an event there is nothing to be specific about, so the
  // prompts stay general rather than implying the assistant can see them.
  citizenIdle: ["How does this app keep me safe?", "What should I do if it gets crowded?"],
};

const COPY = {
  operator: {
    status: "Online · command assistant",
    title: "How can I help?",
    blurb: "Ask about crowd density, bottlenecks, gates, safe exits, or draft an announcement.",
    placeholder: "Ask about crowd, gates, exits…",
  },
  citizen: {
    status: "Online · your safety companion",
    title: "Need help getting around?",
    blurb: "Ask me the safest way out, how busy it is near you, or how to reach somewhere.",
    placeholder: "Ask where to go, what to avoid…",
  },
};

let msgSeq = 0;
const uid = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

// Pull the 24-hex event id out of citizen (…/events/:id/…) or authority
// (…/authority/events/:id/…) routes so the ask is scoped to the event the
// operator is currently viewing. `undefined` when off any event page.
const EVENT_ID_RE = /\/(?:authority\/)?events\/([a-f0-9]{24})/i;

// Cap the context handed to the backend to the last N turns (keeps it small).
const HISTORY_LIMIT = 10;

export default function AssistantChat() {
  const { user } = useAuth();
  const location = useLocation();
  const { getSituation } = useAssistantSituation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Snapshot of what the page published, taken when the panel opens (a user
  // event, so no setState-in-effect). Only drives which prompts to offer; the
  // freshest values are read straight from the ref at send time.
  const [scope, setScope] = useState({});

  const isCitizen = user?.role === "citizen";
  const copy = isCitizen ? COPY.citizen : COPY.operator;
  const quickPrompts = isCitizen
    ? scope.eventId
      ? PROMPTS.citizen
      : PROMPTS.citizenIdle
    : PROMPTS.operator;

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const messagesRef = useRef([]);
  const clearTimerRef = useRef(null);

  // Mirror messages into a ref so `send` can read the transcript to build
  // history without depending on `messages` (which would re-create the
  // callback on every streamed token).
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep the transcript pinned to the newest message (incl. each token).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Focus the composer whenever the panel opens.
  useEffect(() => {
    if (open) {
      clearTimeout(clearTimerRef.current);
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(
    () => () => {
      clearTimeout(clearTimerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  const send = useCallback(
    (raw) => {
      const text = (raw ?? "").trim();
      if (!text || isStreaming) return;

      // Snapshot the prior transcript as {role, content} BEFORE we add the new
      // user turn and the empty in-flight assistant bubble.
      const history = messagesRef.current
        .filter((m) => m.role && m.content && !m.streaming)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }));

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setIsStreaming(true);

      // Stop is wired through an AbortController passed to the fetch `signal`.
      const controller = new AbortController();
      abortRef.current = controller;

      // Where are we? The authority consoles carry the event id in the URL; the
      // citizen app does not (it is a single /citizen screen), so it publishes
      // its event, GPS fix and language instead. Read the ref now, not at open
      // time, so the position is the newest one the phone has.
      const situation = getSituation() || {};
      const eventId = location.pathname.match(EVENT_ID_RE)?.[1] || situation.eventId;

      askAssistant({
        message: text,
        eventId,
        history,
        // Only sent when the citizen consented to location sharing; the backend
        // says plainly that it doesn't know where they are when absent.
        lat: situation.lat,
        lng: situation.lng,
        heading: situation.heading,
        lang: situation.lang,
        signal: controller.signal,
        // The onChunk seam: append each streamed delta to the live bubble.
        onDelta: (tok) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + tok } : m))
          ),
      })
        .then(() => {
          const aborted = controller.signal.aborted;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const next = { ...m, streaming: false };
              // Natural finish with no text -> soft fallback. A Stop that landed
              // before any token leaves the (possibly empty) bubble frozen as-is.
              if (!aborted && !next.content)
                next.content = "I don't have a response for that right now.";
              return next;
            })
          );
          setIsStreaming(false);
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    error: true,
                    content: m.content || "Something went wrong. Please try again.",
                  }
                : m
            )
          );
          setIsStreaming(false);
        })
        .finally(() => {
          abortRef.current = null;
        });
    },
    [isStreaming, location.pathname, getSituation]
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  }, []);

  const minimize = useCallback(() => {
    stopStream();
    setOpen(false);
  }, [stopStream]);

  const close = useCallback(() => {
    stopStream();
    setOpen(false);
    // Clear the thread once the collapse animation has finished (fresh session next open).
    clearTimerRef.current = setTimeout(() => setMessages([]), 300);
  }, [stopStream]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    } else if (e.key === "Escape") {
      minimize();
    }
  };

  const autoGrow = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Companion assistant is only for signed-in users (hidden on landing/login).
  if (!user) return null;

  return (
    <>
      {/* ---------------- Expanded panel ---------------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="assistant-panel"
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-5 right-5 z-[1000] flex h-[600px] max-h-[calc(100vh-2.5rem)] w-[calc(100vw-2.5rem)] max-w-[400px] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur-2xl"
            role="dialog"
            aria-label="CrowdShield AI assistant"
          >
            {/* Ambient glow to match the app's page treatment */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.10),_transparent_45%)]" />

            {/* Header */}
            <div className="relative flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
                <Bot size={20} className="text-cyan-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">CrowdShield AI</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <motion.span
                    animate={{ opacity: [1, 0.35, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  />
                  {isStreaming ? "Thinking…" : copy.status}
                </p>
              </div>
              <button
                onClick={minimize}
                aria-label="Minimize assistant"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <Minus size={17} />
              </button>
              <button
                onClick={close}
                aria-label="Close assistant"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-500/15 hover:text-red-300"
              >
                <X size={17} />
              </button>
            </div>

            {/* Message list */}
            <div ref={listRef} className="relative flex-1 space-y-3.5 overflow-y-auto px-3.5 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_40px_rgba(34,211,238,0.25)]"
                  >
                    <Sparkles size={28} className="text-cyan-300" />
                  </motion.div>
                  <h3 className="text-base font-bold text-white">{copy.title}</h3>
                  <p className="mt-1.5 max-w-[15rem] text-xs leading-5 text-slate-400">
                    {copy.blurb}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {quickPrompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-200"
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                </div>
              ) : (
                messages.map((m) => <ChatMessage key={m.id} message={m} />)
              )}
            </div>

            {/* Composer */}
            <div className="relative border-t border-white/10 bg-white/[0.02] p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={autoGrow}
                  onKeyDown={handleKeyDown}
                  placeholder={copy.placeholder}
                  className="max-h-[120px] flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                />
                <motion.button
                  type={isStreaming ? "button" : "submit"}
                  onClick={isStreaming ? stopStream : undefined}
                  disabled={!isStreaming && !input.trim()}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={isStreaming ? "Stop generating" : "Send message"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </motion.button>
              </form>
              <p className="mt-2 px-1 text-[10px] text-slate-500">
                Enter to send · Shift+Enter for a new line
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- Collapsed launcher (FAB) ---------------- */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="assistant-fab"
            onClick={() => {
              // Read what the page published at the moment of opening, so the
              // greeting and prompts match where the person actually is.
              setScope(getSituation() || {});
              setOpen(true);
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            aria-label="Open CrowdShield AI assistant"
            className="fixed bottom-5 right-5 z-[1000] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/30"
          >
            {/* Pulsing ring */}
            <motion.span
              className="absolute inset-0 rounded-full border border-cyan-300/50"
              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <Bot size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
