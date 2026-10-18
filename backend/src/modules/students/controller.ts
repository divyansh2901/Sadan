import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import { assignStudentToRoomTx } from '../../services/roomAssignment';
import {
  dateValue,
  emailValue,
  idParam,
  optionalString,
  passwordValue,
  positiveInt,
  requiredString,
} from '../../utils/validation';
import { publicStudentUserSelect } from '../../utils/selects';

const roomSelect = {
  id: true,
  number: true,
  type: true,
  floor: true,
  capacity: true,
  occupied: true,
  rent: true,
  status: true,
  amenities: true,
} as const;

const studentListArgs = {
  user: { select: publicStudentUserSelect },
  room: { select: roomSelect },
  payments: { orderBy: { dueDate: 'desc' as const }, take: 1 },
} satisfies Prisma.StudentInclude;

const studentDetailArgs = {
  user: { select: publicStudentUserSelect },
  room: {
    include: {
      students: { include: { user: { select: publicStudentUserSelect } } },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  meals: { where: { isActive: true } },
  cleanReqs: { orderBy: { createdAt: 'desc' as const }, take: 20 },
  sportIssues: {
    include: { equipment: true },
    orderBy: { issuedAt: 'desc' as const },
    take: 20,
  },
} satisfies Prisma.StudentInclude;

function optionalRoomId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return idParam(value, 'roomId');
}

async function findStudentDetail(id: number) {
  return prisma.student.findUnique({ where: { id }, include: studentDetailArgs });
}

export const listStudents = async (req: Request, res: Response): Promise<void> => {
  const search = optionalString(req.query.search, 'search');
  const roomId = req.query.roomId === undefined ? undefined : idParam(req.query.roomId, 'roomId');

  const students = await prisma.student.findMany({
    where: {
      ...(roomId !== undefined && { roomId }),
      ...(search && {
        user: {
          OR: [{ name: { contains: search } }, { email: { contains: search } }],
        },
      }),
    },
    include: studentListArgs,
    orderBy: { user: { name: 'asc' } },
  });
  res.json(students);
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const student = await prisma.student.findUnique({ where: { userId }, include: studentDetailArgs });
  if (!student) throw new HttpError(404, 'Student profile not found');
  res.json(student);
};

export const getStudent = async (req: Request, res: Response): Promise<void> => {
  const student = await findStudentDetail(idParam(req.params.id));
  if (!student) throw new HttpError(404, 'Student not found');
  res.json(student);
};

export const createStudent = async (req: Request, res: Response): Promise<void> => {
  const email = emailValue(req.body.email);
  const password = passwordValue(req.body.password);
  const name = requiredString(req.body.name, 'name');
  const phone = optionalString(req.body.phone, 'phone');
  const course = requiredString(req.body.course, 'course');
  const year = positiveInt(req.body.year, 'year');
  const joinDate = dateValue(req.body.joinDate, 'joinDate')!;
  const roomId = optionalRoomId(req.body.roomId) ?? null;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new HttpError(409, 'Email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const studentId = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone,
          role: 'STUDENT',
          student: { create: { course, year, joinDate } },
        },
        include: { student: true },
      });
      await assignStudentToRoomTx(tx, user.student!.id, roomId);
      return user.student!.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const student = await findStudentDetail(studentId);
  res.status(201).json(student);
};

export const updateStudent = async (req: Request, res: Response): Promise<void> => {
  const studentId = idParam(req.params.id, 'studentId');
  const name = req.body.name === undefined ? undefined : requiredString(req.body.name, 'name');
  const phone = req.body.phone === undefined ? undefined : optionalString(req.body.phone, 'phone');
  const course = req.body.course === undefined ? undefined : requiredString(req.body.course, 'course');
  const year = req.body.year === undefined ? undefined : positiveInt(req.body.year, 'year');
  const roomId = optionalRoomId(req.body.roomId);

  await prisma.$transaction(
    async (tx) => {
      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student) throw new HttpError(404, 'Student not found');

      if (course !== undefined || year !== undefined) {
        await tx.student.update({
          where: { id: studentId },
          data: { ...(course !== undefined && { course }), ...(year !== undefined && { year }) },
        });
      }
      if (name !== undefined || req.body.phone !== undefined) {
        await tx.user.update({
          where: { id: student.userId },
          data: {
            ...(name !== undefined && { name }),
            ...(req.body.phone !== undefined && { phone: phone ?? null }),
          },
        });
      }
      if (roomId !== undefined) await assignStudentToRoomTx(tx, studentId, roomId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const updated = await findStudentDetail(studentId);
  res.json(updated);
};

export const deleteStudent = async (req: Request, res: Response): Promise<void> => {
  const studentId = idParam(req.params.id, 'studentId');
  await prisma.$transaction(
    async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: {
          userId: true,
          roomId: true,
          _count: { select: { payments: true, meals: true, cleanReqs: true, sportIssues: true } },
        },
      });
      if (!student) throw new HttpError(404, 'Student not found');
      const related = student._count.payments + student._count.meals + student._count.cleanReqs + student._count.sportIssues;
      if (related > 0) {
        throw new HttpError(400, 'Cannot delete a student with related records; deactivate the account instead');
      }

      await tx.user.delete({ where: { id: student.userId } });
      if (student.roomId) {
        const room = await tx.room.findUnique({ where: { id: student.roomId } });
        if (room) {
          const occupied = await tx.student.count({ where: { roomId: student.roomId } });
          await tx.room.update({
            where: { id: student.roomId },
            data: {
              occupied,
              ...(room.status !== 'MAINTENANCE' && { status: occupied >= room.capacity ? 'FULL' : 'AVAILABLE' }),
            },
          });
        }
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  res.json({ message: 'Student deleted' });
};
