/**
 * Utility for sanitizing user text input to prevent XSS, command injection, and null byte attacks.
 */
export function sanitizeSearchText(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  return (
    raw
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove HTML tags (<script>, <img>, etc.)
      .replace(/<[^>]*>?/gm, '')
      // Remove control characters (except newline/tab if needed, but for search strip all control chars)
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Normalize multi-spaces into single space
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Checks if an IP string is a private, loopback, or cloud metadata address.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;

  const normalized = ip.trim().toLowerCase();

  // IPv6 loopback and private
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') || // Link-local
    normalized.startsWith('fc00:') || // Unique local
    normalized.startsWith('fd00:')
  ) {
    return true;
  }

  // Handle IPv4-mapped IPv6 (::ffff:127.0.0.1)
  const v4 = normalized.startsWith('::ffff:')
    ? normalized.slice(7)
    : normalized;

  const parts = v4.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  return false;
}
