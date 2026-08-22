import { body } from "express-validator";

export const signupValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 100 }),

  body("mobile")
    .trim()
    .matches(/^[0-9]{10}$/)
    .withMessage("Mobile number must be a valid 10-digit number"),

  body("email").trim().isEmail().withMessage("Enter a valid email address").normalizeEmail(),

  body("age").isInt({ min: 1, max: 120 }).withMessage("Enter a valid age").toInt(),

  body("gender").isIn(["Male", "Female", "Other"]).withMessage("Select a valid gender"),

  body("emergencyContact")
    .trim()
    .matches(/^[0-9]{10}$/)
    .withMessage("Emergency contact must be a valid 10-digit number"),

  body("language").isIn(["English", "Hindi", "Odia", "Other"]).withMessage("Select a valid language"),

  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),

  body("role").optional().isIn(["citizen", "authority"]).withMessage("Role must be citizen or authority"),

  // Optional free-text organisation/department label. Authority accounts are
  // now verified by the uploaded ID document (enforced in the controller as a
  // multipart file), not by this field, so it is no longer required here.
  body("organizationId").optional({ nullable: true }).trim().isLength({ max: 120 }),

  // Location can arrive nested (JSON signups) or flat (multipart signups). Both
  // are optional at the validator layer; the controller enforces presence.
  body("location.latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body("location.longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  body("latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body("longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
];

export const loginValidator = [
  body("identifier").trim().notEmpty().withMessage("Email or mobile number is required"),
  body("password").notEmpty().withMessage("Password is required"),
  body("rememberMe").optional().isBoolean().withMessage("rememberMe must be true or false").toBoolean(),
];
