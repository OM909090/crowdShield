import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ApiError from "./ApiError.js";

// ID cards land here. Kept OUTSIDE any static-served directory on purpose — the
// documents are sensitive PII, so they're only ever streamed back through an
// admin-authenticated endpoint, never linkable directly.
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "idcards");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never trust the client filename for the on-disk name. Keep only a short,
    // sanitized extension and prefix with random bytes to avoid collisions.
    const ext = path.extname(file.originalname || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const runMulter = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new ApiError(400, "ID document must be an image (PNG/JPG/WebP) or a PDF"));
  },
}).single("idCard");

/**
 * Middleware wrapper around multer's single("idCard") that normalizes multer's
 * own errors (e.g. file too large) into our ApiError shape so the global error
 * handler renders them consistently. The field is optional at this layer;
 * whether an ID card is *required* depends on the chosen role and is enforced
 * in the controller.
 */
export const uploadIdCard = (req, res, next) => {
  runMulter(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "ID document is too large (max 5 MB)" : err.message;
      return next(new ApiError(400, msg));
    }
    return next(err); // ApiError from fileFilter, or anything unexpected
  });
};

// Remove an uploaded ID card from disk (best-effort; used on reject/cleanup).
export const removeUpload = (filename) => {
  if (!filename) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
};
