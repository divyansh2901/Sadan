import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import { idParam, nonNegativeInt, optionalString, positiveInt, requiredString } from '../../utils/validation';

const publicEquipmentSelect = {
  id: true,
  name: true,
  total: true,
  available: true,
  condition: true,
  createdAt: true,
} as const;

const issueInclude = {
  equipment: { select: { id: true, name: true } },
  student: { include: { user: { select: { id: true, name: true, email: true } } } },
} as const;

export const listEquipment = async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user!.role === 'STUDENT') {
    res.json(await prisma.sportsEquipment.findMany({ select: publicEquipmentSelect, orderBy: { name: 'asc' } }));
    return;
  }
  res.json(await prisma.sportsEquipment.findMany({
    include: { issues: { where: { returnedAt: null }, include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } } } },
    orderBy: { name: 'asc' },
  }));
};

export const getEquipment = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'equipmentId');
  if (req.user!.role === 'STUDENT') {
    const equipment = await prisma.sportsEquipment.findUnique({ where: { id }, select: publicEquipmentSelect });
    if (!equipment) throw new HttpError(404, 'Equipment not found');
    res.json(equipment);
    return;
  }
  const equipment = await prisma.sportsEquipment.findUnique({
    where: { id },
    include: { issues: { include: issueInclude, orderBy: { issuedAt: 'desc' } } },
  });
  if (!equipment) throw new HttpError(404, 'Equipment not found');
  res.json(equipment);
};

export const addEquipment = async (req: Request, res: Response): Promise<void> => {
  const name = requiredString(req.body.name, 'name');
  const total = positiveInt(req.body.total, 'total');
  const condition = requiredString(req.body.condition ?? 'GOOD', 'condition');
  const equipment = await prisma.sportsEquipment.create({ data: { name, total, available: total, condition } });
  res.status(201).json(equipment);
};

export const updateEquipment = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'equipmentId');
  const current = await prisma.sportsEquipment.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'Equipment not found');
  const activeIssues = await prisma.equipmentIssue.count({ where: { equipmentId: id, returnedAt: null } });
  const total = req.body.total === undefined ? current.total : positiveInt(req.body.total, 'total');
  const condition = req.body.condition === undefined ? current.condition : requiredString(req.body.condition, 'condition');
  if (total < activeIssues) throw new HttpError(400, 'total cannot be lower than currently issued units');
  const equipment = await prisma.sportsEquipment.update({
    where: { id },
    data: { total, available: total - activeIssues, condition },
  });
  res.json(equipment);
};

export const deleteEquipment = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'equipmentId');
  const equipment = await prisma.sportsEquipment.findUnique({ where: { id }, select: { id: true } });
  if (!equipment) throw new HttpError(404, 'Equipment not found');
  const activeIssues = await prisma.equipmentIssue.count({ where: { equipmentId: id, returnedAt: null } });
  if (activeIssues > 0) throw new HttpError(400, 'Equipment currently issued out');
  const history = await prisma.equipmentIssue.count({ where: { equipmentId: id } });
  if (history > 0) throw new HttpError(400, 'Equipment with issue history cannot be deleted');
  await prisma.sportsEquipment.delete({ where: { id } });
  res.json({ message: 'Equipment deleted' });
};

export const issueEquipment = async (req: Request, res: Response): Promise<void> => {
  const equipmentId = idParam(req.params.id, 'equipmentId');
  const studentId = idParam(req.body.studentId, 'studentId');
  const notes = optionalString(req.body.notes, 'notes');
  const equipment = await prisma.sportsEquipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
  if (!equipment) throw new HttpError(404, 'Equipment not found');
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw new HttpError(404, 'Student not found');

  const issueId = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.sportsEquipment.updateMany({
        where: { id: equipmentId, available: { gt: 0 } },
        data: { available: { decrement: 1 } },
      });
      if (updated.count !== 1) throw new HttpError(400, 'No units available');
      const issue = await tx.equipmentIssue.create({ data: { equipmentId, studentId, notes } });
      return issue.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const issue = await prisma.equipmentIssue.findUnique({ where: { id: issueId }, include: issueInclude });
  res.status(201).json(issue);
};

export const returnEquipment = async (req: Request, res: Response): Promise<void> => {
  const equipmentId = idParam(req.params.id, 'equipmentId');
  const issueId = idParam(req.body.issueId, 'issueId');
  const equipment = await prisma.sportsEquipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
  if (!equipment) throw new HttpError(404, 'Equipment not found');
  await prisma.$transaction(
    async (tx) => {
      const issue = await tx.equipmentIssue.findUnique({ where: { id: issueId } });
      if (!issue || issue.equipmentId !== equipmentId) throw new HttpError(404, 'Issue record not found');
      if (issue.returnedAt) throw new HttpError(400, 'Already returned');
      await tx.equipmentIssue.update({ where: { id: issueId }, data: { returnedAt: new Date() } });
      await tx.sportsEquipment.update({ where: { id: equipmentId }, data: { available: { increment: 1 } } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  const issue = await prisma.equipmentIssue.findUnique({ where: { id: issueId }, include: issueInclude });
  res.json(issue);
};

export const listIssues = async (_req: Request, res: Response): Promise<void> => {
  res.json(await prisma.equipmentIssue.findMany({ include: issueInclude, orderBy: { issuedAt: 'desc' } }));
};
