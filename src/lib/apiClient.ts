/**
 * Frontend API Client Configuration & Base URL Resolver
 * 
 * Automatically routes API requests to the live VPS MongoDB backend at
 * https://antonyschool.in/api when running inside the preview environment:
 * - window.location.hostname.includes('aistudio.google.com')
 * - window.location.hostname.includes('.run.app')
 * - process.env.NODE_ENV === 'development'
 * 
 * In standard production (or when deployed directly on the domain),
 * it uses standard relative paths '/api'.
 */

export const LIVE_VPS_API_BASE = 'https://antonyschool.in/api';

export function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }

  const hostname = window.location.hostname || '';
  return (
    hostname.includes('aistudio.google.com') ||
    hostname.includes('.run.app') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    process.env.NODE_ENV === 'development' ||
    import.meta.env.DEV ||
    import.meta.env.MODE === 'development'
  );
}

export function getApiBaseUrl(): string {
  // In the browser preview, cross-origin requests directly to https://antonyschool.in/api
  // are blocked by browser CORS restrictions because antonyschool.in does not emit Access-Control-Allow-Origin.
  // Standard relative '/api' routes through the same-origin Express server without CORS errors.
  return '/api';
}

/**
 * Transforms an endpoint path (e.g. '/api/whatsapp/status' or '/attendance/mark')
 * to the appropriate base URL based on the environment.
 */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;

  // If already an absolute URL, return as is
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  // Ensure leading slash
  if (!pathOrUrl.startsWith('/')) {
    return `/api/${pathOrUrl}`;
  }

  // If already starts with /api, return as is
  if (pathOrUrl.startsWith('/api')) {
    return pathOrUrl;
  }

  return `/api${pathOrUrl}`;
}
