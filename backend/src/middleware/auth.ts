import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

export type UserRole = 'ADMIN' | 'STUDENT' | 'STAFF';

export interface AuthRequest extends Request {
  user?: { id: number; role: UserRole; email: string };
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'your-super-secret-key-here') {
    throw new Error('JWT_SECRET must be configured with a secure value of at least 32 characters');
  }
  return secret;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authorization = req.headers.authorization;
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret()) as jwt.JwtPayload & {
      id?: number;
      role?: UserRole;
      email?: string;
    };

    if (!decoded.id || !decoded.role || !decoded.email) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    req.user = { id: user.id, role: user.role as UserRole, email: user.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authorize = (...roles: UserRole[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    next();
  };

export function signAccessToken(user: { id: number; role: UserRole; email: string }): string {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    jwtSecret(),
    { expiresIn: '2h' },
  );
}
