import { existsSync, mkdirSync } from "fs";
import { diskStorage } from "multer";
import { join, extname } from "path";

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function generateRandomHex(len = 16) {
  return Array(len)
    .fill(null)
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join("");
}

function safeFilename(uploadDir: string, originalName: string) {
  const baseName = originalName.replace(/\.[^/.]+$/, "");
  const extension = extname(originalName);
  let finalName = originalName;
  const fullPath = join(uploadDir, finalName);
  if (existsSync(fullPath)) {
    finalName = `${baseName}-${generateRandomHex()}${extension}`;
  }
  return finalName;
}

export const trainingPdfUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), "uploads", "training");
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), "uploads", "training");
      const finalName = safeFilename(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are allowed"), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for training docs
};
