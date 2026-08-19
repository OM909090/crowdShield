import { body, param } from "express-validator";
import {
  ZONE_TYPES,
  NODE_TYPES,
  NODE_STATES,
  EDGE_DIRECTIONS,
  EDGE_STATES,
} from "../models/Venue.js";

/** A coordinate must be exactly [lat, lng]. */
const isLatLng = (v) =>
  Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);

const everyLatLng = (arr) => Array.isArray(arr) && arr.every(isLatLng);

export const upsertVenueValidator = [
  // AoR is optional while the authority is still drawing, but if present it
  // must be a real ring.
  body("aor.polygon")
    .optional({ nullable: true })
    .isArray()
    .withMessage("AoR polygon must be an array of [lat, lng] points")
    .bail()
    .custom((v) => v.length === 0 || (v.length >= 3 && everyLatLng(v)))
    .withMessage("AoR polygon needs at least 3 valid [lat, lng] points"),

  body("bufferMeters").optional().isFloat({ min: 0, max: 20000 }).toFloat(),

  // ---- zones ----
  body("zones").optional().isArray().withMessage("zones must be an array"),
  body("zones.*.id").optional({ checkFalsy: true }).isString().trim().isLength({ max: 24 }),
  body("zones.*.name").isString().trim().notEmpty().withMessage("Each zone needs a name").isLength({ max: 120 }),
  body("zones.*.type").optional().isIn(ZONE_TYPES).withMessage("Invalid zone type"),
  body("zones.*.polygon")
    .isArray({ min: 3 })
    .withMessage("Each zone polygon needs at least 3 points")
    .bail()
    .custom(everyLatLng)
    .withMessage("Zone polygon points must be [lat, lng]"),

  // ---- nodes ----
  body("nodes").optional().isArray().withMessage("nodes must be an array"),
  body("nodes.*.id").optional({ checkFalsy: true }).isString().trim().isLength({ max: 24 }),
  body("nodes.*.name").optional({ checkFalsy: true }).isString().trim().isLength({ max: 120 }),
  body("nodes.*.type").isIn(NODE_TYPES).withMessage("Invalid node type"),
  body("nodes.*.at").custom(isLatLng).withMessage("Node position must be [lat, lng]"),
  body("nodes.*.widthM").optional().isFloat({ min: 0, max: 200 }).toFloat(),
  body("nodes.*.throughputPerMin").optional().isFloat({ min: 0 }).toFloat(),
  body("nodes.*.state").optional().isIn(NODE_STATES).withMessage("Invalid node state"),
  body("nodes.*.isDestination").optional().isBoolean().toBoolean(),

  // ---- edges ----
  body("edges").optional().isArray().withMessage("edges must be an array"),
  body("edges.*.id").optional({ checkFalsy: true }).isString().trim().isLength({ max: 24 }),
  body("edges.*.from").isString().trim().notEmpty().withMessage("Edge needs a 'from' node id"),
  body("edges.*.to").isString().trim().notEmpty().withMessage("Edge needs a 'to' node id"),
  body("edges.*.path")
    .isArray({ min: 2 })
    .withMessage("Each edge path needs at least 2 points")
    .bail()
    .custom(everyLatLng)
    .withMessage("Edge path points must be [lat, lng]"),
  body("edges.*.widthM").optional().isFloat({ min: 0, max: 200 }).toFloat(),
  body("edges.*.direction").optional().isIn(EDGE_DIRECTIONS).withMessage("Invalid edge direction"),
  body("edges.*.state").optional().isIn(EDGE_STATES).withMessage("Invalid edge state"),

  // ---- tuning ----
  body("h3.analysisRes").optional().isInt({ min: 6, max: 14 }).toInt(),
  body("h3.rollupRes").optional().isInt({ min: 5, max: 13 }).toInt(),
  body("calibration.participationRate").optional().isFloat({ min: 0.001, max: 1 }).toFloat(),
];

export const nodeIdValidator = [
  param("nodeId").isString().trim().notEmpty().withMessage("Invalid node id"),
];

export const edgeIdValidator = [
  param("edgeId").isString().trim().notEmpty().withMessage("Invalid edge id"),
];

export const patchNodeValidator = [
  body("state").optional().isIn(NODE_STATES).withMessage("Invalid node state"),
  body("widthM").optional().isFloat({ min: 0, max: 200 }).toFloat(),
  body("throughputPerMin").optional().isFloat({ min: 0 }).toFloat(),
  body("isDestination").optional().isBoolean().toBoolean(),
];

export const patchEdgeValidator = [
  body("state").optional().isIn(EDGE_STATES).withMessage("Invalid edge state"),
  body("direction").optional().isIn(EDGE_DIRECTIONS).withMessage("Invalid edge direction"),
  body("widthM").optional().isFloat({ min: 0, max: 200 }).toFloat(),
];
