import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import { assignStudentToRoom } from '../../services/roomAssignment';
import {
  enumValue,
  idParam,
  nonNegativeInt,
  normalizeAmenities,
  optionalString,
  positiveAmount,
  requiredString,
} from '../../utils/validation';

const roomTypes = ['SINGLE', 'DOUBLE', 'SHARED'] as const;
const roomStatuses = ['AVAILABLE', 'FULL', 'MAINTENANCE'] as const;

const safeStudent = {
  id: true,
  course: true,
  year: true,
  roomId: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

function roomIdFromParam(value: unknown): number {
  return idParam(value, 'roomId');
}

export const listRooms = async (req: AuthRequest, res: Response): Promise<void> => {
  const type = req.query.type === undefined ? undefined : enumValue(req.query.type, 'type', roomTypes);
  const status = req.query.status === undefined ? undefined : enumValue(req.query.status, 'status', roomStatuses);
  const floor = req.query.floor === undefined ? undefined : nonNegativeInt(req.query.floor, 'floor');

  const rooms = await prisma.room.findMany({
    where: { ...(type && { type }), ...(status && { status }), ...(floor !== undefined && { floor }) },
    include: {
      students: { select: safeStudent },
    },
    orderBy: { number: 'asc' },
  });

  if (req.user?.role === 'STUDENT') {
    res.json(rooms.map(({ students: _students, ...room }) => room));
    return;
  }
  res.json(rooms);
};

export const getRoom = async (req: AuthRequest, res: Response): Promise<void> => {
  const room = await prisma.room.findUnique({
    where: { id: idParam(req.params.id, 'roomId') },
    include: { students: { select: safeStudent } },
  });
  if (!room) throw new HttpError(404, 'Room not found');
  if (req.user?.role === 'STUDENT') {
    const { students: _students, ...safeRoom } = room;
    res.json(safeRoom);
    return;
  }
  res.json(room);
};

export const createRoom = async (req: Request, res: Response): Promise<void> => {
  const number = requiredString(req.body.number, 'number');
  const type = enumValue(req.body.type, 'type', roomTypes);
  const floor = nonNegativeInt(req.body.floor, 'floor');
  const capacity = nonNegativeInt(req.body.capacity, 'capacity');
  if (capacity < 1) throw new HttpError(400, 'capacity must be at least 1');
  const rent = positiveAmount(req.body.rent, 'rent');
  const amenities = normalizeAmenities(req.body.amenities);

  try {
    const room = await prisma.room.create({ data: { number, type, floor, capacity, rent, amenities } });
    res.status(201).json(room);
  } catch (error: any) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Room number already exists');
    throw error;
  }
};

export const updateRoom = async (req: Request, res: Response): Promise<void> => {
  const roomId = idParam(req.params.id, 'roomId');
  const current = await prisma.room.findUnique({ where: { id: roomId } });
  if (!current) throw new HttpError(404, 'Room not found');

  const number = req.body.number === undefined ? undefined : requiredString(req.body.number, 'number');
  const type = req.body.type === undefined ? undefined : enumValue(req.body.type, 'type', roomTypes);
  const floor = req.body.floor === undefined ? undefined : nonNegativeInt(req.body.floor, 'floor');
  const capacity = req.body.capacity === undefined ? undefined : nonNegativeInt(req.body.capacity, 'capacity');
  const rent = req.body.rent === undefined ? undefined : positiveAmount(req.body.rent, 'rent');
  const status = req.body.status === undefined ? undefined : enumValue(req.body.status, 'status', roomStatuses);
  const amenities = req.body.amenities === undefined ? undefined : normalizeAmenities(req.body.amenities);

  const occupied = await prisma.student.count({ where: { roomId } });
  if (capacity !== undefined && capacity < Math.max(1, occupied)) {
    throw new HttpError(400, 'capacity cannot be lower than current occupancy');
  }
  if (status === 'AVAILABLE' && occupied >= (capacity ?? current.capacity)) {
    throw new HttpError(400, 'A full room cannot be marked available');
  }
  if (status === 'FULL' && occupied < (capacity ?? current.capacity)) {
    throw new HttpError(400, 'A room can be marked full only at capacity');
  }

  try {
    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(number !== undefined && { number }),
        ...(type && { type }),
        ...(floor !== undefined && { floor }),
        ...(capacity !== undefined && { capacity }),
        ...(rent !== undefined && { rent }),
        ...(status && { status }),
        ...(!status && current.status !== 'MAINTENANCE' && { status: occupied >= (capacity ?? current.capacity) ? 'FULL' : 'AVAILABLE' }),
        ...(amenities !== undefined && { amenities }),
        occupied,
      },
    });
    res.json(room);
  } catch (error: any) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Room number already exists');
    throw error;
  }
};

export const deleteRoom = async (req: Request, res: Response): Promise<void> => {
  const roomId = idParam(req.params.id, 'roomId');
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) throw new HttpError(404, 'Room not found');
  const occupants = await prisma.student.count({ where: { roomId } });
  if (occupants > 0) throw new HttpError(400, 'Cannot delete a room with students assigned');
  await prisma.room.delete({ where: { id: roomId } });
  res.json({ message: 'Room deleted' });
};

export const allocateRoom = async (req: Request, res: Response): Promise<void> => {
  const roomId = roomIdFromParam(req.params.id);
  const studentId = idParam(req.body.studentId, 'studentId');
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { roomId: true } });
  if (!student) throw new HttpError(404, 'Student not found');
  await assignStudentToRoom(studentId, roomId);
  res.json({ message: 'Room allocated' });
};

export const transferRoom = async (req: Request, res: Response): Promise<void> => {
  const fromRoomId = roomIdFromParam(req.params.id);
  const toRoomId = roomIdFromParam(req.body.toRoomId);
  const studentId = idParam(req.body.studentId, 'studentId');
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { roomId: true } });
  if (!student) throw new HttpError(404, 'Student not found');
  if (student.roomId !== fromRoomId) throw new HttpError(400, 'Student is not assigned to the source room');
  await assignStudentToRoom(studentId, toRoomId);
  res.json({ message: 'Transfer successful' });
};
