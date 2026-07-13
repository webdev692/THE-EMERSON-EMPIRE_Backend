function cleanString(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned === '' ? null : cleaned;
}

function requireFields(body, fields) {
  return fields
    .map((fieldName) => {
      const value = cleanString(body[fieldName]);
      return value ? null : `${fieldName} is required`;
    })
    .filter(Boolean);
}

function isValidUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

function moduleEnabled(envKey) {
  return process.env[envKey] === 'true';
}

module.exports = {
  cleanString,
  requireFields,
  isValidUrl,
  isValidEmail,
  moduleEnabled,
};
