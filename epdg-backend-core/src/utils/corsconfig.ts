import { CorsOptions } from "cors";

// Add origins via CORS_ORIGINS env var (comma-separated) or use defaults
const extraOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [];

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://emersonproffesionaldevelopment.netlify.app",
  ...extraOrigins,
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials:    true,
  maxAge:         600,
};
