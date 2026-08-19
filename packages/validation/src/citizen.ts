import { z } from "zod";
import { INCIDENT_CATEGORIES, LANGUAGES } from "@crowdshield/config";

/**
 * The citizen-facing request bodies: reporting, routing, position heartbeats and
 * the assistant. Mirrors `backend/validators/incident.validator.js`,
 * `agent.validator.js`, and the inline checks in `guidance.controller.js`.
 */

/** A finite latitude. Rejects NaN, which `Number.isFinite` catches server-side. */
export const latitude = z.number().finite().min(-90).max(90);
export const longitude = z.number().finite().min(-180).max(180);

/** Both coordinates or neither — a lone latitude is meaningless. */
export const positionSchema = z.object({
  lat: latitude,
  lng: longitude,
  /** Compass degrees. The server accepts 0-360. */
  heading: z.number().finite().min(0).max(360).optional(),
});
export type PositionInput = z.infer<typeof positionSchema>;

/**
 * `POST /events/:id/incidents` — a report or an SOS.
 * `sos` is in the category enum but is never offered in the report picker: it is
 * the panic button, not a dropdown choice.
 */
export const incidentSchema = z.object({
  category: z.enum(INCIDENT_CATEGORIES, { message: "Select a valid incident category" }),
  note: z.string().trim().max(500, "Note is too long").optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
});
export type IncidentInput = z.infer<typeof incidentSchema>;

/** `POST /events/:id/guidance` — route me to a place I picked. */
export const guidanceSchema = positionSchema.extend({
  destinationId: z.string().trim().min(1).optional(),
});
export type GuidanceInput = z.infer<typeof guidanceSchema>;

/** `POST /events/:id/exit-route` — get me out safely. Position only. */
export const exitRouteSchema = z.object({ lat: latitude, lng: longitude });
export type ExitRouteInput = z.infer<typeof exitRouteSchema>;

/**
 * One anonymous position report. The device hash is a random UUID generated on
 * first run and never tied to the account — it is what lets the aggregator count
 * a device twice in a row without knowing whose it is.
 */
export const heartbeatSchema = z.object({
  deviceHash: z.string().min(8),
  lat: latitude,
  lng: longitude,
  heading: z.number().finite().min(0).max(360).optional(),
  speed: z.number().finite().min(0).optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

/**
 * The server accepts up to 1000 heartbeats per request (413 beyond that). Matching
 * it exactly rather than guessing lower: a client cap stricter than the server's is
 * a silent ceiling that only shows up when a batched or replayed upload is
 * rejected locally for no reason the user can see.
 */
export const ingestSchema = z.object({
  heartbeats: z.array(heartbeatSchema).min(1).max(1000),
});

/** `POST /ai/assistant/ask`. Position and language are what make it personal. */
export const assistantAskSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long"),
  /** 24-hex Mongo id, matching the server's isMongoId check. */
  eventId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid eventId").optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
  heading: z.number().finite().min(0).max(360).optional(),
  lang: z.enum(LANGUAGES).optional(),
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
