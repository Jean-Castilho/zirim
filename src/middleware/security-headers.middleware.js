/**
 * Cabeçalhos de segurança HTTP (equivalente aos padrões do helmet, sem dependência extra).
 *
 * Para testar uma CSP nova sem bloquear nada, defina CSP_REPORT_ONLY=true:
 * o navegador apenas registra as violações no console.
 */
const isProd = process.env.NODE_ENV === "production";

const CDN_SCRIPT = "https://unpkg.com https://cdnjs.cloudflare.com";
const GOOGLE_MAPS_SCRIPT = "https://maps.googleapis.com https://maps.gstatic.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${CDN_SCRIPT} ${GOOGLE_MAPS_SCRIPT}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${CDN_SCRIPT}`,
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://maps.googleapis.com https://brasilapi.com.br https://viacep.com.br https://nominatim.openstreetmap.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const cspHeaderName = process.env.CSP_REPORT_ONLY === "true"
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

export const securityHeaders = (req, res, next) => {
  res.set({
    [cspHeaderName]: CONTENT_SECURITY_POLICY,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), payment=(self)",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  });
  if (isProd) {
    res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
};
