// Database configuration example
export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'emerson_db',
};

// Server configuration
export const serverConfig = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
};

// Other configurations can be added here
