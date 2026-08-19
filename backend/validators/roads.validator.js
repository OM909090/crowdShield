import { body } from "express-validator";

/**
 * The only input the import accepts is `force`. Everything else — which area to
 * fetch, how wide a road is, how much crowd it can carry — is derived
 * server-side from the venue's coverage polygon and OSM, because a client that
 * could name its own coverage area could make the agent reason about the wrong
 * streets.
 */
export const importRoadsValidator = [
  body("force")
    .optional()
    .isBoolean()
    .withMessage("force must be true or false")
    .toBoolean(),
];
