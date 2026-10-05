/**
 * Frontend API Client Configuration & Base URL Resolver
 * 
 * Default API base URL: "https://antonyschool.in"
 * 
 * Configures endpoints for student and staff data:
 * - https://antonyschool.in/api/students
 * - https://antonyschool.in/api/maintenance/db-proxy
 * 
 * In the AI Studio preview browser container:
 * Routes API requests through the container's backend CORS proxy to safely fetch live data
 * from antonyschool.in without browser cross-origin restrictions.
 */

export const DEFAULT_API_BASE_URL = 'https://antonyschool.in';
export const LIVE_VPS_API_BASE = 'https://antonyschool.in';
export const STUDENTS_API_URL = 'https://antonyschool.in/api/students';
export const DB_PROXY_API_URL = 'https://antonyschool.in/api/maintenance/db-proxy';

export function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = (window.location.hostname || '').toLowerCase();
  
  // Production domain
  if (hostname === 'antonyschool.in' || hostname === 'www.antonyschool.in') {
    return false;
  }

  // Preview sandbox (AI Studio, WebContainer, localhost, Cloud Run preview)
  return true;
}

export function getApiBaseUrl(): string {
  return '/api';
}

/**
 * Resolves an API URL or path to the proper endpoint.
 * In AI Studio / preview sandbox, routes directly to https://antonyschool.in/api.
 * On production (antonyschool.in), routes to relative /api.
 */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;

  const base = getApiBaseUrl();

  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    if (pathOrUrl.startsWith('https://antonyschool.in/api') || pathOrUrl.startsWith('http://antonyschool.in/api')) {
      if (base === '/api') {
        return pathOrUrl.replace(/^https?:\/\/antonyschool\.in\/api/, '/api');
      }
      return pathOrUrl;
    }
    return pathOrUrl;
  }

  let subPath = pathOrUrl;
  if (subPath.startsWith('/api/')) {
    subPath = subPath.substring(5);
  } else if (subPath.startsWith('/api')) {
    subPath = subPath.substring(4);
  }
  if (subPath.startsWith('/')) {
    subPath = subPath.substring(1);
  }

  return subPath ? (base + '/' + subPath) : base;
}
