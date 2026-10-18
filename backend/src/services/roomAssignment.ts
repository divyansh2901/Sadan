import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { HttpError } from '../middleware/errorHandler';

type DbClient = Prisma.TransactionClient;

async function syncRoomState(tx: DbClient, roomId: number): Promise<void> {
  const room = await tx.room.findUnique({ where: { id: roomId } });
  if (!room) return;

  const occupied = await tx.student.count({ where: { roomId } });
  await tx.room.update({
    where: { id: roomId },
    data: {
      occupied,
      ...(room.status !== 'MAINTENANCE' && {
        status: occupied >= room.capacity ? 'FULL' : 'AVAILABLE',
      }),
    },
  });
}

export async function assignStudentToRoomTx(
  tx: DbClient,
  studentId: number,
  roomId: number | null,
): Promise<void> {
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: { id: true, roomId: true },
  });
  if (!student) throw new HttpError(404, 'Student not found');

  if (roomId !== null) {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.status === 'MAINTENANCE') throw new HttpError(400, 'Room is under maintenance');

    const occupied = await tx.student.count({ where: { roomId, NOT: { id: studentId } } });
    if (occupied >= room.capacity) throw new HttpError(400, 'Room is full');
  }

  if (student.roomId !== roomId) {
    await tx.student.update({ where: { id: studentId }, data: { roomId } });
  }

  if (student.roomId) await syncRoomState(tx, student.roomId);
  if (roomId) await syncRoomState(tx, roomId);
}

export async function assignStudentToRoom(studentId: number, roomId: number | null): Promise<void> {
  await prisma.$transaction(
    (tx) => assignStudentToRoomTx(tx, studentId, roomId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function syncAllRoomStates(): Promise<void> {
  const rooms = await prisma.room.findMany({ select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const room of rooms) await syncRoomState(tx, room.id);
  });
}
