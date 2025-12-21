// ==============================
// FEEDBACK DOCUMENT UPLOAD

import { existsSync, mkdirSync } from "fs";
import { diskStorage } from "multer";
import { join, extname } from "path";

// ==============================


function ensureDir2(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// safe filename
function generateRandomHex2(len = 16) {
  return Array(len)
    .fill(null)
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('');
}

function safeFilename2(uploadDir: string, originalName: string) {
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const extension = extname(originalName);
  let finalName = originalName;
  let fullPath = join(uploadDir, finalName);
  if (existsSync(fullPath)) {
    finalName = `${baseName}-${generateRandomHex2()}${extension}`;
  }
  return finalName;
}

// ==============================
// PDF UPLOAD
// ==============================
export const pdfUploadOptions = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'pdfs');
      ensureDir2(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'pdfs');
      const finalName = safeFilename2(uploadDir, file.originalname);
      cb(null, finalName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
};
