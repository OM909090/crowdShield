import { body } from "express-validator";

// require_tld:false so local providers (http://localhost:11434/v1, LAN IPs)
// validate; we still constrain the protocol to http/https.
const baseUrlRule = () =>
  body("baseUrl")
    .isURL({ require_tld: false, protocols: ["http", "https"], require_protocol: true })
    .withMessage("Enter a valid http(s) base URL");

export const discoverValidator = [
  baseUrlRule(),
  body("apiKey").optional().isString().withMessage("API key must be a string"),
];

export const saveConfigValidator = [
  baseUrlRule(),
  body("model").isString().withMessage("A model is required").bail().trim().notEmpty().withMessage("Select a model"),
  body("apiKey").optional().isString().withMessage("API key must be a string"),
  body("label").optional().isString().isLength({ max: 80 }).withMessage("Label is too long (max 80 characters)"),
];
