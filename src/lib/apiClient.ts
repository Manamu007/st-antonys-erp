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
    return true;
  }

  const hostname = window.location.hostname || '';
  
  // Production domain
  if (hostname === 'antonyschool.in' || hostname === 'www.antonyschool.in') {
    return false;
  }

  // Running in preview container (AI Studio, Cloud Run, localhost, dev)
  return true;
}

export function getApiBaseUrl(): string {
  // In non-browser environments, return the full live production URL
  if (typeof window === 'undefined') {
    return DEFAULT_API_BASE_URL;
  }
  // In the browser preview container, use relative paths so requests hit
  // the container's CORS-enabled Express proxy which securely communicates with antonyschool.in
  return '';
}

/**
 * Resolves an API URL or path to the proper endpoint.
 * In the browser preview container, ensures requests route via the local CORS-enabled Express proxy.
 */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;

  // In browser preview: rewrite direct antonyschool.in API calls to relative paths so they
  // go through our Express server which proxies to https://antonyschool.in with full CORS headers
  if (typeof window !== 'undefined') {
    if (pathOrUrl.startsWith('https://antonyschool.in/api/') || pathOrUrl.startsWith('http://antonyschool.in/api/')) {
      return pathOrUrl.replace(/^https?:\/\/antonyschool\.in/, '');
    }
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return cleanPath.startsWith('/api') ? cleanPath : `/api${cleanPath}`;
  }

  // Server-side / Node.js runtime:
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const fullApiPath = cleanPath.startsWith('/api') ? cleanPath : `/api${cleanPath}`;
  return `${DEFAULT_API_BASE_URL}${fullApiPath}`;
}
