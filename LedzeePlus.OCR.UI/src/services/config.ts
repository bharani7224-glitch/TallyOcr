// Centralized environment & API configuration

const isDev = import.meta.env.DEV;

export const CONFIG = {
  // Python OCR Extract Service (http://192.23.2.41:1010/extract)
  // In dev mode, use Vite proxy /ocr-api to avoid CORS restrictions
  ocrExtractUrl: import.meta.env.VITE_OCR_URL || (isDev ? '/ocr-api/extract' : 'http://192.23.2.41:1010/extract'),
  ocrStatusUrl: import.meta.env.VITE_OCR_STATUS_URL || (isDev ? '/ocr-api/api/invoice/status' : 'http://192.23.2.41:1010/api/invoice/status'),

  // Cloud Backend API (.NET 8/10 at http://192.23.2.41:1012)
  backendApiUrl: import.meta.env.VITE_BACKEND_URL || (isDev ? '/backend-api' : 'http://192.23.2.41:1012'),
};

