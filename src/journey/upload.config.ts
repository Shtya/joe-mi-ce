// src/upload.config.ts
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// generate random string
function generateRandomHex(len = 16) {
  return Array(len)
    .fill(null)
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('');
}

// main helper: return original name OR new random name if exists
function safeFilename(uploadDir: string, originalName: string) {
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const extension = extname(originalName);

  let finalName = originalName;
  let fullPath = join(uploadDir, finalName);

  // if file already exists → generate random rename
  if (existsSync(fullPath)) {
    finalName = `${baseName}-${generateRandomHex()}${extension}`;
    fullPath = join(uploadDir, finalName);
  }

  return finalName;
}

// ==============================
// IMAGE UPLOAD
// ==============================
export const imageUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'images');
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'images');
      const finalName = safeFilename(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|jpg|gif|webp|svg\+xml)$/.test(file.mimetype))
      return cb(null, true);

    cb(new Error('Unsupported image type'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
};

// ==============================
// VIDEO UPLOAD
// ==============================
export const videoUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'videos');
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'videos');
      const finalName = safeFilename(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (/^video\/(mp4|quicktime|x-matroska|webm|x-msvideo)$/.test(file.mimetype))
      return cb(null, true);

    cb(new Error('Unsupported video type'), false);
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
};

// ==============================
// CHECK-IN / CHECK-OUT UPLOAD
// ==============================
export const checkinDocumentUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'checkins');
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'checkins');
      const finalName = safeFilename(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => cb(null, true),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
};

// ==============================
// FEEDBACK DOCUMENT UPLOAD
// ==============================
export const feedbackUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'feedback');
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'feedback');
      const finalName = safeFilename(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => cb(null, true),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
};
