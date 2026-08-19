import { body, param } from "express-validator";
import { INCIDENT_CATEGORY_VALUES } from "../models/Incident.js";

export const createIncidentValidator = [
  body("category").isIn(INCIDENT_CATEGORY_VALUES).withMessage("Select a valid incident category"),
  body("note").optional().isString().isLength({ max: 500 }).withMessage("Note is too long"),
  body("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude").toFloat(),
  body("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude").toFloat(),
];

export const incidentIdValidator = [param("incidentId").isMongoId().withMessage("Invalid incident id")];

export const statusUpdateValidator = [
  body("status").optional().isIn(["acknowledged", "resolved"]).withMessage("Invalid status"),
];
