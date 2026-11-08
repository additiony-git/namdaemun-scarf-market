const googleKeysUrl = 'https://www.googleapis.com/oauth2/v3/certs';
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
let cachedKeys;
let pendingKeys;

async function getKeys(now) {
  if (cachedKeys?.expires > now) return cachedKeys.keys;
  pendingKeys ??= (async () => {
    const response = await fetch(googleKeysUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('Google signing keys unavailable');
    const { keys } = await response.json();
    if (!Array.isArray(keys)) throw Error('Invalid Google signing keys');
    const maxAge = Number(/\bmax-age=(\d+)/i.exec(response.headers.get('Cache-Control') ?? '')?.[1] ?? 60);
    cachedKeys = { keys, expires: now + maxAge * 1000 };
    return keys;
  })().finally(() => { pendingKeys = undefined; });
  return pendingKeys;
}

function decode(segment) {
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) throw Error('Invalid token encoding');
  return Uint8Array.from(atob(segment.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

export async function verifyGoogleCredential(credential, clientId, now = Date.now(), loadKeys = getKeys) {
  if (typeof credential !== 'string' || credential.length > 8192) return null;
  const parts = credential.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const decoder = new TextDecoder();
  let claims, metadata, signed;
  try {
    metadata = JSON.parse(decoder.decode(decode(header)));
    claims = JSON.parse(decoder.decode(decode(payload)));
    signed = decode(signature);
  } catch { return null; }
  if (metadata?.alg !== 'RS256' || typeof metadata.kid !== 'string' ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(claims?.iss) ||
      claims.aud !== clientId || (claims.azp && claims.azp !== clientId) ||
      !Number.isInteger(claims.exp) || claims.exp * 1000 <= now ||
      !Number.isInteger(claims.iat) || claims.iat * 1000 > now + 60_000 ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
      typeof claims.nonce !== 'string' || !/^[a-f0-9]{48}$/.test(claims.nonce)) return null;
  const keys = await loadKeys(now);
  const jwk = keys.find(key => key.kid === metadata.kid && key.kty === 'RSA' && key.alg === 'RS256');
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
  const valid = await crypto.subtle.verify(algorithm, key, signed, new TextEncoder().encode(header + '.' + payload));
  return valid ? { subject: claims.sub, nonce: claims.nonce } : null;
}
