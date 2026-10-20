import multer from "multer";
import { ValidationError } from "./errors.js";

export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;

/**
 * Upload de imagens em memória, com limite de tamanho, quantidade e tipo.
 * A validação final do conteúdo continua sendo feita pelo sharp.
 */
export const imageUpload = () => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_UPLOAD_FILES,
    fields: 50,
  },
  fileFilter(req, file, callback) {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      return callback(new ValidationError("Envie apenas imagens JPEG, PNG, WebP, GIF ou AVIF."));
    }
    return callback(null, true);
  },
});

/** Converte erros do multer (tamanho, quantidade) em erro de validação HTTP 400. */
export const handleUploadErrors = (middleware) => (req, res, next) =>
  middleware(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Cada imagem deve ter no máximo 5 MB."
        : "Quantidade ou formato de arquivos inválido.";
      return next(new ValidationError(message));
    }
    return next(error);
  });
