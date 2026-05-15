import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/db';
import { config } from '../../lib/config';
import { AppError } from '../../lib/types';
import type { SignupInput, LoginInput, RefreshInput } from '../validators/auth.validators';

const SALT_ROUNDS = 12;

function issueTokens(userId: string) {
  // Cast needed: config returns plain `string`, but jsonwebtoken @types expects `StringValue`
  const accessToken = jwt.sign({ sub: userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign({ sub: userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as SignupInput;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const tokens = issueTokens(user.id);
    res.status(201).json({ userId: user.id, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as LoginInput;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const tokens = issueTokens(user.id);
    res.json({ userId: user.id, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body as RefreshInput;

    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError(401, 'User not found', 'INVALID_TOKEN');
    }

    const tokens = issueTokens(user.id);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
}
