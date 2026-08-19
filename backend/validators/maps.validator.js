import { body } from "express-validator";

export const saveMapsValidator = [
  body("apiKey").optional({ nullable: true }).isString().withMessage("apiKey must be a string"),
  body("routesBaseUrl")
    .optional()
    .isURL({ require_tld: false, protocols: ["http", "https"] })
    .withMessage("routesBaseUrl must be a valid URL"),
  body("placesBaseUrl")
    .optional()
    .isURL({ require_tld: false, protocols: ["http", "https"] })
    .withMessage("placesBaseUrl must be a valid URL"),
  body("enabled").optional().isBoolean().withMessage("enabled must be a boolean"),
];
