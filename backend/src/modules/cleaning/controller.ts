import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import {
  dateValue,
  enumValue,
  idParam,
  nonNegativeInt,
  optionalString,
  requiredString,
} from '../../utils/validation';

const cleaningTypes = ['REGULAR', 'DEEP_CLEAN', 'BATHROOM', 'WINDOW'] as const;
const cleaningPriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
const cleaningStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const requestInclude = {
  student: { include: { user: { select: { id: true, name: true, email: true } } } },
  assignedTo: { include: { user: { select: { id: true, name: true, email: true } } } },
} as const;

async function currentStudentId(userId: number): Promise<number> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw new HttpError(404, 'Student profile not found');
  return student.id;
}

async function ownedRequest(requestId: number, userId: number) {
  const request = await prisma.cleaningRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  if (!request || request.student.userId !== userId) throw new HttpError(404, 'Cleaning request not found');
  return request;
}

export const listRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  const status = req.query.status === undefined ? undefined : enumValue(req.query.status, 'status', cleaningStatuses);
  const priority = req.query.priority === undefined ? undefined : enumValue(req.query.priority, 'priority', cleaningPriorities);
  const studentId = req.user!.role === 'STUDENT' ? await currentStudentId(req.user!.id) : undefined;
  const requests = await prisma.cleaningRequest.findMany({
    where: { ...(studentId !== undefined && { studentId }), ...(status && { status }), ...(priority && { priority }) },
    include: requestInclude,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  res.json(requests);
};

export const getRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'requestId');
  const request = req.user!.role === 'STUDENT'
    ? await ownedRequest(id, req.user!.id)
    : await prisma.cleaningRequest.findUnique({ where: { id }, include: requestInclude });
  if (!request) throw new HttpError(404, 'Request not found');
  res.json(request);
};

export const createRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const type = enumValue(req.body.type, 'type', cleaningTypes);
  const priority = req.body.priority === undefined ? 'MEDIUM' : enumValue(req.body.priority, 'priority', cleaningPriorities);
  const notes = optionalString(req.body.notes, 'notes');
  let studentId: number;
  let roomNumber: string;

  if (req.user!.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, room: { select: { number: true } } },
    });
    if (!student) throw new HttpError(404, 'Student profile not found');
    if (!student.room) throw new HttpError(400, 'A room must be assigned before requesting cleaning');
    studentId = student.id;
    roomNumber = student.room.number;
  } else {
    studentId = idParam(req.body.studentId, 'studentId');
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { room: { select: { number: true } } },
    });
    if (!student) throw new HttpError(404, 'Student not found');
    roomNumber = student.room?.number ?? requiredString(req.body.roomNumber, 'roomNumber');
  }

  const request = await prisma.cleaningRequest.create({
    data: { studentId, roomNumber, type, priority, notes },
    include: requestInclude,
  });
  res.status(201).json(request);
};

export const updateRequest = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'requestId');
  const current = await prisma.cleaningRequest.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'Request not found');
  const status = req.body.status === undefined ? undefined : enumValue(req.body.status, 'status', cleaningStatuses);
  const priority = req.body.priority === undefined ? undefined : enumValue(req.body.priority, 'priority', cleaningPriorities);
  const type = req.body.type === undefined ? undefined : enumValue(req.body.type, 'type', cleaningTypes);
  const notes = req.body.notes === undefined ? undefined : optionalString(req.body.notes, 'notes');
  if (status === 'COMPLETED') throw new HttpError(400, 'Use the complete endpoint to complete a request');
  if (status === 'IN_PROGRESS' && current.status !== 'PENDING') throw new HttpError(400, 'Only pending requests can start');
  if (status === 'CANCELLED' && ['COMPLETED', 'CANCELLED'].includes(current.status)) throw new HttpError(400, 'Request cannot be cancelled');

  const request = await prisma.cleaningRequest.update({
    where: { id },
    data: { ...(status !== undefined && { status }), ...(priority !== undefined && { priority }), ...(type !== undefined && { type }), ...(notes !== undefined && { notes: notes ?? null }) },
    include: requestInclude,
  });
  res.json(request);
};

export const assignRequest = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'requestId');
  const staffId = idParam(req.body.staffId, 'staffId');
  const scheduledAt = dateValue(req.body.scheduledAt, 'scheduledAt', false);
  const current = await prisma.cleaningRequest.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'Request not found');
  if (['COMPLETED', 'CANCELLED'].includes(current.status)) throw new HttpError(400, 'Closed requests cannot be assigned');
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) throw new HttpError(404, 'Staff member not found');

  const request = await prisma.cleaningRequest.update({
    where: { id },
    data: { assignedToId: staffId, status: 'IN_PROGRESS', scheduledAt: scheduledAt ?? null },
    include: requestInclude,
  });
  res.json(request);
};

export const completeRequest = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'requestId');
  const current = await prisma.cleaningRequest.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'Request not found');
  if (current.status !== 'IN_PROGRESS') throw new HttpError(400, 'Only in-progress requests can be completed');
  const request = await prisma.cleaningRequest.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: requestInclude,
  });
  res.json(request);
};

export const submitFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'requestId');
  const rating = nonNegativeInt(req.body.rating, 'rating');
  if (rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be 1–5');
  const current = await ownedRequest(id, req.user!.id);
  if (current.status !== 'COMPLETED') throw new HttpError(400, 'Feedback can be submitted after completion');
  const request = await prisma.cleaningRequest.update({ where: { id }, data: { feedback: rating }, include: requestInclude });
  res.json(request);
};
