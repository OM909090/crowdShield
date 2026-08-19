import { motion } from "framer-motion";

/**
 * Three staggered dots shown inside an assistant bubble while the model is
 * "thinking" (before the first streamed token arrives).
 */
export default function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-0.5" aria-label="Assistant is thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-cyan-300"
          animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
