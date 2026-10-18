import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import { enumValue, idParam, optionalString } from '../../utils/validation';
import { safeUserSelect } from '../../utils/selects';

const roles = ['ADMIN', 'STUDENT', 'STAFF'] as const;

export const getDashboard = async (_req: Request, res: Response): Promise<void> => {
  const [
    totalStudents,
    totalRooms,
    availableRooms,
    occupiedRooms,
    pendingPayments,
    overduePayments,
    paidRevenue,
    pendingCleaning,
    upcomingEvents,
    activeIssues,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.room.count(),
    prisma.room.count({ where: { status: 'AVAILABLE' } }),
    prisma.room.count({ where: { occupied: { gt: 0 } } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'OVERDUE' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.cleaningRequest.count({ where: { status: 'PENDING' } }),
    prisma.event.count({ where: { status: 'UPCOMING' } }),
    prisma.equipmentIssue.count({ where: { returnedAt: null } }),
  ]);

  const [roomsByType, recentPayments] = await Promise.all([
    prisma.room.groupBy({ by: ['type'], _sum: { capacity: true, occupied: true }, _count: { type: true } }),
    prisma.payment.findMany({
      where: { status: 'PAID' },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { paidDate: 'desc' },
      take: 5,
    }),
  ]);

  res.json({
    summary: {
      totalStudents,
      totalRooms,
      availableRooms,
      occupiedRooms,
      pendingPayments,
      overduePayments,
      totalRevenue: Number(paidRevenue._sum.amount ?? 0),
      pendingCleaning,
      upcomingEvents,
      activeIssues,
    },
    roomsByType,
    recentPayments,
  });
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const role = req.query.role === undefined ? undefined : enumValue(req.query.role, 'role', roles);
  const search = optionalString(req.query.search, 'search');
  const users = await prisma.user.findMany({
    where: {
      ...(role && { role }),
      ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] }),
    },
    select: {
      ...safeUserSelect,
      student: { select: { id: true, course: true, room: { select: { number: true } } } },
      staff: { select: { id: true, department: true, shift: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const userId = idParam(req.params.id, 'userId');
  const name = req.body.name === undefined ? undefined : optionalString(req.body.name, 'name');
  const phone = req.body.phone === undefined ? undefined : optionalString(req.body.phone, 'phone');
  const role = req.body.role === undefined ? undefined : enumValue(req.body.role, 'role', roles);
  const isActive = req.body.isActive === undefined ? undefined : req.body.isActive;
  if (isActive !== undefined && typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be boolean');
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!current) throw new HttpError(404, 'User not found');

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && { name: name ?? '' }),
      ...(phone !== undefined && { phone: phone ?? null }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
    },
    select: safeUserSelect,
  });
  res.json(user);
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = idParam(req.params.id, 'userId');
  if (userId === req.user!.id) throw new HttpError(400, 'You cannot delete your own account');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new HttpError(404, 'User not found');
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    throw new HttpError(400, 'User has related records; deactivate the account instead');
  }
  res.json({ message: 'User deleted' });
};

export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  const userId = idParam(req.params.id, 'userId');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user) throw new HttpError(404, 'User not found');
  const updated = await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive }, select: { isActive: true } });
  res.json(updated);
};

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const module = optionalString(req.query.module, 'module');
  const logs = await prisma.auditLog.findMany({
    where: { ...(module && { module }) },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
};
