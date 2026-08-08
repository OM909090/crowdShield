import { body, param } from "express-validator";
import { EVENT_TYPE_VALUES } from "../models/Event.js";

export const createEventValidator = [
  body("name").trim().notEmpty().withMessage("Event name is required").isLength({ max: 150 }),

  body("type").isIn(EVENT_TYPE_VALUES).withMessage("Select a valid event type"),

  body("description").optional({ checkFalsy: true }).isLength({ max: 2000 }),

  body("startDate").isISO8601().withMessage("Enter a valid start date and time").toDate(),

  body("endDate")
    .isISO8601()
    .withMessage("Enter a valid end date and time")
    .toDate()
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error("End date/time must be after the start date/time");
      }
      return true;
    }),

  body("location.venueName").trim().notEmpty().withMessage("Venue name is required"),
  body("location.address").trim().notEmpty().withMessage("Address is required"),
  body("location.coordinates.latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body("location.coordinates.longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 }),

  body("expectedAttendance")
    .optional({ checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage("Expected attendance must be a positive number")
    .toInt(),

  body("bannerUrl").optional({ checkFalsy: true }).isURL().withMessage("Banner must be a valid URL"),
];

export const updateEventValidator = createEventValidator.map((chain) => chain.optional());

export const eventIdValidator = [param("id").isMongoId().withMessage("Invalid event id")];
