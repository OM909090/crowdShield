import ApiError from "../utils/ApiError.js";

export const notFound = (req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
};

// Must be registered last, after all routes.
export const errorHandler = (err, req, res, next) => {
  let { statusCode, message, details } = err;

  // Translate common non-ApiError failures into safe, predictable responses
  if (err.name === "ValidationError") {
    statusCode = 422;
    message = Object.values(err.errors)[0]?.message || "Validation failed";
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `An account with this ${field} already exists`;
  } else if (!statusCode) {
    statusCode = 500;
    message = message || "Something went wrong";
  }

  if (statusCode === 500) {
    // Never leak internal error details to the client
    console.error(err);
    message = process.env.NODE_ENV === "production" ? "Something went wrong" : message;
  }

  res.status(statusCode).json({
    message,
    ...(details && process.env.NODE_ENV !== "production" ? { details } : {}),
  });
};
