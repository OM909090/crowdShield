import { body, param } from "express-validator";
import { MAP_MARKER_TYPES } from "../models/MapMarker.js";

export const createMarkerValidator = [
  body("type").isIn(MAP_MARKER_TYPES).withMessage("Select a valid marker type"),
  body("label").optional({ checkFalsy: true }).isLength({ max: 100 }),
  body("note").optional({ checkFalsy: true }).isLength({ max: 500 }),
  body("lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude").toFloat(),
  body("lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude").toFloat(),
];

export const markerIdValidator = [param("markerId").isMongoId().withMessage("Invalid marker id")];
