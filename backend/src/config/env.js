/**
 * @fileoverview Configuration (env).
 * @module config/env
 */
/**
 * Central env (populated from `backend/.env` via dotenv in server.js / build.js).
 */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: num(process.env.PORT, 5000),
  JWT_SECRET: process.env.JWT_SECRET || 'medica-dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  /** Max JSON request body size (bulk CSV/JSON imports). Default 10mb. */
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT || '10mb',

  /** Atlas / local — any of these names */
  MONGODB_URI:
    process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || '',

  /**
   * MongoDB driver socket `family`: 4 (IPv4), 6 (IPv6), or unset = OS default.
   * Default 4 avoids common Windows / NAT64 IPv6 timeouts to Atlas; set `auto` to unset.
   */
  MONGODB_LOOKUP_FAMILY: (() => {
    const raw = process.env.MONGODB_LOOKUP_FAMILY;
    if (raw === undefined || raw === '') return 4;
    const s = String(raw).trim().toLowerCase();
    if (s === '0' || s === 'auto' || s === 'any') return undefined;
    if (s === '4' || s === 'ipv4') return 4;
    if (s === '6' || s === 'ipv6') return 6;
    const n = Number(s);
    if (n === 4 || n === 6) return n;
    return 4;
  })(),

  /** Demo seed password (Mongo `syncExampleUsersToMongo` / `seedMongo`) */
  SEED_PASSWORD: process.env.SEED_PASSWORD || '',

  /**
   * Optional break-glass login password. When set, any active user can sign in with
   * their email + this password instead of their account password.
   * Leave unset in production unless explicitly required.
   */
  MASTER_PASSWORD: process.env.MASTER_PASSWORD || '',

  /** Outbound mail (e.g. Gmail + app password) — use when you add nodemailer */
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: num(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',

  /** WhatsApp Cloud API Configuration */
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v19.0',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || 'medica_verify_token_default_value',
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || 'medica_app_secret_default_value',

  /** Web Push (VAPID) — generate with: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@medica.local',

  /** Bull / ioredis / future queue driver */
  REDIS_URL: process.env.REDIS_URL || '',

  /** File Management Integration Configuration */
  FILE_MANAGEMENT_API_URL: process.env.FILE_MANAGEMENT_API_URL || 'http://localhost:3001/api',
  FILE_MANAGEMENT_API_KEY: process.env.FILE_MANAGEMENT_API_KEY || '',
  FILE_DOCUMENT_LINKS_RELATIVE: (() => {
    const raw = process.env.FILE_DOCUMENT_LINKS_RELATIVE;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const apiPublicBase = (process.env.API_PUBLIC_BASE_URL ?? '').trim();
    if (/^same-origin$/i.test(apiPublicBase) || /^relative$/i.test(apiPublicBase)) return true;
    if (/^https?:\/\//i.test(apiPublicBase)) return false;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  })(),
  API_PUBLIC_BASE_URL: (() => {
    const raw = (process.env.API_PUBLIC_BASE_URL ?? '').trim();
    if (process.env.FILE_DOCUMENT_LINKS_RELATIVE === 'true') return '';
    if (/^same-origin$/i.test(raw) || /^relative$/i.test(raw)) return '';
    if (/^https?:\/\//i.test(raw)) return String(raw).replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') return '';
    return 'http://localhost:5000';
  })(),
  FILE_MANAGEMENT_REQUEST_TIMEOUT_MS: num(process.env.FILE_MANAGEMENT_REQUEST_TIMEOUT_MS, 60000),
  FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS: num(process.env.FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS, 1200000),
  FILE_MANAGEMENT_POLL_INTERVAL_MS: num(process.env.FILE_MANAGEMENT_POLL_INTERVAL_MS, 5000),
  FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE: process.env.FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE === 'true',
};

