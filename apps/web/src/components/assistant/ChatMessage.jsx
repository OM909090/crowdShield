import { memo } from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import ThinkingIndicator from "./ThinkingIndicator";
import Markdown from "./Markdown";

/**
 * A single chat row.
 * - user:      cyan→blue gradient bubble, right-aligned (the app's signature accent)
 * - assistant: glass bubble, left-aligned, with thinking dots + streaming caret
 *
 * message = { id, role: "user" | "assistant", content, streaming?, error? }
 */
function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isThinking = message.streaming && !message.content;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
          isUser
            ? "border-blue-400/25 bg-blue-500/15 text-blue-200"
            : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
        }`}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      {/* Bubble */}
      {isUser ? (
        <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-400 to-blue-500 px-3.5 py-2.5 text-sm font-medium leading-6 text-slate-950 shadow-lg shadow-cyan-500/15">
          {message.content}
        </div>
      ) : (
        <div
          className={`max-w-[82%] break-words rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm leading-6 backdrop-blur-xl ${
            message.error
              ? "border-red-400/25 bg-red-500/10 text-red-100"
              : "border-white/10 bg-white/[0.06] text-slate-100"
          }`}
        >
          {isThinking ? (
            <ThinkingIndicator />
          ) : (
            <>
              {/* Assistant replies are Markdown (bold names, bullet steps, `###`
                  labels) — rendered as elements, never as raw HTML. */}
              <Markdown>{message.content}</Markdown>
              {message.streaming && (
                <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-cyan-300 align-middle" />
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default memo(ChatMessage);
