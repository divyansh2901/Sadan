import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import {
  dateValue,
  enumValue,
  idParam,
  optionalString,
  positiveAmount,
} from '../../utils/validation';

const paymentTypes = ['MONTHLY', 'SEMESTER', 'ONE_TIME'] as const;
const paymentStatuses = ['PAID', 'PENDING', 'OVERDUE'] as const;

const paymentInclude = {
  student: {
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
  room: { select: { id: true, number: true, type: true } },
} as const;

async function studentIdForUser(userId: number): Promise<number> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw new HttpError(404, 'Student profile not found');
  return student.id;
}

async function findPaymentForUser(paymentId: number, userId: number) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (payment.student.userId !== userId) throw new HttpError(404, 'Payment not found');
  return payment;
}

export const listPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  const status = req.query.status === undefined ? undefined : enumValue(req.query.status, 'status', paymentStatuses);
  const type = req.query.type === undefined ? undefined : enumValue(req.query.type, 'type', paymentTypes);
  const studentId = req.user!.role === 'STUDENT'
    ? await studentIdForUser(req.user!.id)
    : req.query.studentId === undefined ? undefined : idParam(req.query.studentId, 'studentId');

  const payments = await prisma.payment.findMany({
    where: { ...(status && { status }), ...(type && { type }), ...(studentId !== undefined && { studentId }) },
    include: paymentInclude,
    orderBy: { dueDate: 'asc' },
  });
  res.json(payments);
};

export const getPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const paymentId = idParam(req.params.id, 'paymentId');
  const payment = req.user!.role === 'STUDENT'
    ? await findPaymentForUser(paymentId, req.user!.id)
    : await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
  if (!payment) throw new HttpError(404, 'Payment not found');
  res.json(payment);
};

export const createPayment = async (req: Request, res: Response): Promise<void> => {
  const studentId = idParam(req.body.studentId, 'studentId');
  const amount = positiveAmount(req.body.amount);
  const type = enumValue(req.body.type, 'type', paymentTypes);
  const dueDate = dateValue(req.body.dueDate, 'dueDate')!;
  const roomId = req.body.roomId === undefined || req.body.roomId === null || req.body.roomId === ''
    ? undefined
    : idParam(req.body.roomId, 'roomId');
  const notes = optionalString(req.body.notes, 'notes');

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, roomId: true } });
  if (!student) throw new HttpError(404, 'Student not found');
  if (roomId !== undefined) {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) throw new HttpError(404, 'Room not found');
  }

  const payment = await prisma.payment.create({
    data: { studentId, roomId: roomId ?? student.roomId, amount, type, dueDate, notes },
    include: paymentInclude,
  });
  res.status(201).json(payment);
};

export const updatePayment = async (req: Request, res: Response): Promise<void> => {
  const paymentId = idParam(req.params.id, 'paymentId');
  const current = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!current) throw new HttpError(404, 'Payment not found');

  const status = req.body.status === undefined ? undefined : enumValue(req.body.status, 'status', paymentStatuses);
  const amount = req.body.amount === undefined ? undefined : positiveAmount(req.body.amount);
  const type = req.body.type === undefined ? undefined : enumValue(req.body.type, 'type', paymentTypes);
  const dueDate = req.body.dueDate === undefined ? undefined : dateValue(req.body.dueDate, 'dueDate');
  const paidDate = req.body.paidDate === undefined ? undefined : dateValue(req.body.paidDate, 'paidDate', false);
  const paymentMethod = req.body.paymentMethod === undefined ? undefined : optionalString(req.body.paymentMethod, 'paymentMethod');
  const notes = req.body.notes === undefined ? undefined : optionalString(req.body.notes, 'notes');

  const nextStatus = status ?? current.status;
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      ...(amount !== undefined && { amount }),
      ...(type !== undefined && { type }),
      ...(dueDate !== undefined && { dueDate }),
      status: nextStatus,
      paidDate: nextStatus === 'PAID' ? (paidDate ?? current.paidDate ?? new Date()) : null,
      ...(paymentMethod !== undefined && { paymentMethod: paymentMethod ?? null }),
      ...(notes !== undefined && { notes: notes ?? null }),
    },
    include: paymentInclude,
  });
  res.json(payment);
};

export const markPaid = async (req: Request, res: Response): Promise<void> => {
  const paymentId = idParam(req.params.id, 'paymentId');
  const paymentMethod = optionalString(req.body.paymentMethod ?? 'CASH', 'paymentMethod')!;
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'PAID', paidDate: new Date(), paymentMethod },
    include: paymentInclude,
  });
  res.json(payment);
};

export const checkOverdue = async (_req: Request, res: Response): Promise<void> => {
  const result = await prisma.payment.updateMany({
    where: { status: 'PENDING', dueDate: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  });
  res.json({ updated: result.count });
};
