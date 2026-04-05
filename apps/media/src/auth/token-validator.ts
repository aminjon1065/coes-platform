import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  username: string;
  positionId?: string;
  clearance?: number;
}

export function validateAccessToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  const payload = jwt.verify(token, secret) as JwtPayload;
  if (!payload.sub) throw new Error('Invalid token: missing sub');
  return payload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
