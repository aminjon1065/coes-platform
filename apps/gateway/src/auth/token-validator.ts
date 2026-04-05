import jwt from 'jsonwebtoken';

export interface TokenClaims {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET environment variable is required');
}

export function validateAccessToken(token: string): TokenClaims {
  return jwt.verify(token, ACCESS_SECRET!) as TokenClaims;
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}
