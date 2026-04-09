import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  username: string;
  positionId?: string;
  clearance?: number;
  scope?: string;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;

export function validateAccessToken(token: string): JwtPayload {
  if (!ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET environment variable is required');
  }

  const payload = jwt.verify(token, ACCESS_SECRET) as JwtPayload;
  if (!payload.sub) throw new Error('Invalid token: missing sub');
  if (payload.scope === 'mfa_pending') {
    throw new Error('MFA verification required');
  }
  return payload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
