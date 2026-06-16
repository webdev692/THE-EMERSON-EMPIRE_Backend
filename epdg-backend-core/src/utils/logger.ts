// Logger utility for consistent logging
export const logger = {
  info: (message: string, data?: any) => {
    console.log(`ℹ️  [INFO] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`❌ [ERROR] ${message}`, error || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`⚠️  [WARN] ${message}`, data || '');
  },
  success: (message: string, data?: any) => {
    console.log(`✅ [SUCCESS] ${message}`, data || '');
  },
};
