import { EventEmitter } from "events";

/**
 * Process-wide alert bus. The predictor/alerts service emits here on every
 * escalation; the LLM trigger service (E4) will subscribe to decide when the
 * agent should wake. Decoupled from Socket.IO so non-socket consumers (the
 * agent, loggers) can listen too.
 *
 * Events:
 *   "alert" -> { kind: "risk_escalation" | "resolved", eventId, alert?, zoneId? }
 */
export const alertBus = new EventEmitter();
alertBus.setMaxListeners(50);
