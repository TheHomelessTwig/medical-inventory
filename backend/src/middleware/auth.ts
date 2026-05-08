import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'doctor' | 'nurse';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  type: string;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
    if (payload.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    const result = await query(
      'SELECT id, email, name, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    req.user = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      name: result.rows[0].name,
      role: result.rows[0].role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

export const requireAdmin = requireRole('admin');
export const requireAdminOrNurse = requireRole('admin', 'nurse');
export const requireAnyRole = requireRole('admin', 'doctor', 'nurse');
