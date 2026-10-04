import type { NextConfig } from 'next';
// The API routes read the committed store and the official pack at request time; a serverless build must ship those files.
const data = ['./store/rules.jsonl', './store/constraints.jsonl', './store/constraints.withheld.jsonl', './store/stacks.json', './store/change_cases.json', './store/ingested/**', './official/pack/corpus/**', './official/pack/data/**', './official/pack/dev/**', './supplemental/text/**', './out/selfcheck.json'];
// The app loads nothing from another origin: scripts, styles, fonts and data are all its own. Development needs eval for React refresh.
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=()' }
];
const config: NextConfig = {
  poweredByHeader: false, experimental: { cpus: 2 },
  // The page for / evaluates the default request on the server, so it reads the same files the API does.
  outputFileTracingIncludes: { '/api/**': data, '/': data, '/portfolio': data },
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; }
};
export default config;
