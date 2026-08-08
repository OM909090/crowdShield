import { validationResult } from "express-validator";
import ApiError from "../utils/ApiError.js";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const details = errors.array({ onlyFirstError: true }).map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  next(new ApiError(422, details[0].message, details));
};
