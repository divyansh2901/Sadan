import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../config/database';
import { sendEmail } from '../../utils/email';
import { signAccessToken } from '../../middleware/auth';
import { emailValue, passwordValue, requiredString, optionalString, positiveInt, dateValue } from '../../utils/validation';

export const login = async (req: Request, res: Response): Promise<void> => {
  const email = emailValue(req.body.email);
  const password = passwordValue(req.body.password);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }
    const token = signAccessToken({ id: user.id, role: user.role, email: user.email });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const email = emailValue(req.body.email);
  const password = passwordValue(req.body.password);
  const name = requiredString(req.body.name, 'name');
  const phone = optionalString(req.body.phone, 'phone');
  const course = optionalString(req.body.course, 'course') ?? 'Undeclared';
  const year = req.body.year === undefined ? 1 : positiveInt(req.body.year, 'year');
  const joinDate = dateValue(req.body.joinDate, 'joinDate', false) ?? new Date();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        phone,
        role: 'STUDENT',
        student: { create: { course, year, joinDate } },
      },
    });
    res.status(201).json({ message: 'Registered successfully' });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const email = emailValue(req.body.email);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      await sendEmail(
        email,
        'Reset your HostelPro password',
        `<p>Click to reset: <a href="${resetUrl}">${resetUrl}</a> (expires in 1 hour)</p>`,
      );
    }
    // Always return same response to prevent email enumeration
    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch {
    res.status(500).json({ error: 'Failed to process request' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const token = requiredString(req.body.token, 'token', 4096);
  const password = passwordValue(req.body.password);
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
        throw new Error('Invalid or expired token');
      }
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
    });
    res.json({ message: 'Password reset successful' });
  } catch {
    res.status(400).json({ error: 'Invalid or expired token' });
  }
};
