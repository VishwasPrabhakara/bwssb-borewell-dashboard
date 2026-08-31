/* ==========================================================================
   BBMP Borewell Dashboard - Configuration & Security Settings
   ========================================================================== */

/**
 * Safely resolves and validates the API Base URL from query parameters.
 * Restricts custom ?api= overrides to approved origins (localhost or workers.dev)
 * to prevent SSRF and untrusted domain injection attacks.
 */
const getValidApiBaseUrl = () => {
  const paramUrl = new URLSearchParams(window.location.search).get('api');
  if (paramUrl) {
    try {
      const parsed = new URL(paramUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
      const isWorker = hostname.endsWith('.workers.dev') || hostname.endsWith('.github.io');
      if ((parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocal)) && (isLocal || isWorker)) {
        return paramUrl.replace(/\/$/, '');
      }
      console.warn(`[Security] Untrusted API URL domain '${paramUrl}' ignored. Falling back to default API.`);
    } catch (e) {
      console.warn(`[Security] Invalid API URL parameter '${paramUrl}' ignored. Falling back to default API.`);
    }
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port === '8765' || window.location.port === '8788')) {
    return window.location.origin;
  }
  return 'https://bbmp-borewell-api.vishwas-borewellworkersdev.workers.dev';
};

const API_BASE_URL = getValidApiBaseUrl();
const WARD_WEEKLY_API_VERSION = 'ww-kh-cycles-20260831-1';
const SPECIFIC_CAPACITY_API_VERSION = 'sc-kh-cycles-20260831-1';
const PUMPING_PERFORMANCE_API_VERSION = 'pump-kh-cycles-20260831-1';
const bangaloreCenter = [12.9716, 77.5946];

console.log('%c BBMP Borewell Dashboard ', 'background: #1d4ed8; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;', 'Loaded modular build v2026.08.05');

