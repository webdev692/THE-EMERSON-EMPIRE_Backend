import { CorsOptions } from 'cors';

const developmentOrigins = ['http://localhost:5173', 'http://localhost:5174'];

export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.NODE_ENV === 'production') {
    return [...new Set(configured)];
  }

  return [...new Set([...developmentOrigins, ...configured])];
}

const allowedOrigins = getAllowedOrigins();

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Server-to-server clients do not send an Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    const error = new Error('Origin is not allowed');
    Object.assign(error, { statusCode: 403 });
    return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 600,
};
