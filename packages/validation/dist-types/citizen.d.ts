import { z } from "zod";
/**
 * The citizen-facing request bodies: reporting, routing, position heartbeats and
 * the assistant. Mirrors `backend/validators/incident.validator.js`,
 * `agent.validator.js`, and the inline checks in `guidance.controller.js`.
 */
/** A finite latitude. Rejects NaN, which `Number.isFinite` catches server-side. */
export declare const latitude: z.ZodNumber;
export declare const longitude: z.ZodNumber;
/** Both coordinates or neither — a lone latitude is meaningless. */
export declare const positionSchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    heading: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type PositionInput = z.infer<typeof positionSchema>;
/**
 * `POST /events/:id/incidents` — a report or an SOS.
 * `sos` is in the category enum but is never offered in the report picker: it is
 * the panic button, not a dropdown choice.
 */
export declare const incidentSchema: z.ZodObject<{
    category: z.ZodEnum<{
        sos: "sos";
        medical: "medical";
        hazard: "hazard";
        blocked: "blocked";
        lost: "lost";
        other: "other";
    }>;
    note: z.ZodOptional<z.ZodString>;
    lat: z.ZodOptional<z.ZodNumber>;
    lng: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type IncidentInput = z.infer<typeof incidentSchema>;
/** `POST /events/:id/guidance` — route me to a place I picked. */
export declare const guidanceSchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    heading: z.ZodOptional<z.ZodNumber>;
    destinationId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GuidanceInput = z.infer<typeof guidanceSchema>;
/** `POST /events/:id/exit-route` — get me out safely. Position only. */
export declare const exitRouteSchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
}, z.core.$strip>;
export type ExitRouteInput = z.infer<typeof exitRouteSchema>;
/**
 * One anonymous position report. The device hash is a random UUID generated on
 * first run and never tied to the account — it is what lets the aggregator count
 * a device twice in a row without knowing whose it is.
 */
export declare const heartbeatSchema: z.ZodObject<{
    deviceHash: z.ZodString;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    heading: z.ZodOptional<z.ZodNumber>;
    speed: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
/**
 * The server accepts up to 1000 heartbeats per request (413 beyond that). Matching
 * it exactly rather than guessing lower: a client cap stricter than the server's is
 * a silent ceiling that only shows up when a batched or replayed upload is
 * rejected locally for no reason the user can see.
 */
export declare const ingestSchema: z.ZodObject<{
    heartbeats: z.ZodArray<z.ZodObject<{
        deviceHash: z.ZodString;
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        heading: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** `POST /ai/assistant/ask`. Position and language are what make it personal. */
export declare const assistantAskSchema: z.ZodObject<{
    message: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    history: z.ZodOptional<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<{
            user: "user";
            assistant: "assistant";
        }>;
        content: z.ZodString;
    }, z.core.$strip>>>;
    lat: z.ZodOptional<z.ZodNumber>;
    lng: z.ZodOptional<z.ZodNumber>;
    heading: z.ZodOptional<z.ZodNumber>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        hi: "hi";
        or: "or";
    }>>;
}, z.core.$strip>;
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
