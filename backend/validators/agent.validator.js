import { body, param } from "express-validator";

export const askValidator = [
  body("message").isString().withMessage("message is required").bail().trim().notEmpty().withMessage("message cannot be empty").isLength({ max: 2000 }).withMessage("message is too long"),
  body("eventId").optional({ nullable: true }).isMongoId().withMessage("Invalid eventId"),
  body("history").optional().isArray().withMessage("history must be an array"),
  // A citizen's own position, so the assistant can answer "which way out?" from
  // where they actually stand instead of guessing. Optional: location sharing is
  // consent-based, and the assistant says so plainly when it is absent.
  body("lat").optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage("lat must be a latitude").toFloat(),
  body("lng").optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage("lng must be a longitude").toFloat(),
  body("heading").optional({ nullable: true }).isFloat({ min: 0, max: 360 }).withMessage("heading must be 0-360").toFloat(),
  body("lang").optional({ nullable: true }).isIn(["en", "hi", "or"]).withMessage("Unsupported language"),
];

export const proposalIdValidator = [param("proposalId").isMongoId().withMessage("Invalid proposal id")];

export const broadcastValidator = [
  body("message")
    .isString()
    .withMessage("message is required")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("message cannot be empty")
    .isLength({ max: 500 })
    .withMessage("message is too long (max 500 characters)"),
  body("messages").optional().isObject().withMessage("messages must be an object keyed by language"),
  body("severity")
    .optional()
    .isIn(["info", "warning", "critical"])
    .withMessage("severity must be info, warning or critical"),
  body("cohorts").optional().isArray().withMessage("cohorts must be an array"),
  body("zoneIds").optional().isArray().withMessage("zoneIds must be an array"),
];
