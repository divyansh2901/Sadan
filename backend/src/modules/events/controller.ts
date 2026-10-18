import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';
import {
  booleanValue,
  dateValue,
  enumValue,
  idParam,
  optionalString,
  requiredString,
} from '../../utils/validation';

const eventCategories = ['CULTURAL', 'SPORTS', 'MEETING', 'GENERAL'] as const;
const eventStatuses = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

async function eventWithRsvp(eventId: number, userId: number) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { _count: { select: { rsvps: true } } },
  });
  if (!event) return null;
  const rsvp = await prisma.eventRSVP.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { going: true },
  });
  return { ...event, myRsvp: rsvp?.going ?? null };
}

export const listEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  const category = req.query.category === undefined ? undefined : enumValue(req.query.category, 'category', eventCategories);
  const status = req.query.status === undefined ? undefined : enumValue(req.query.status, 'status', eventStatuses);
  const events = await prisma.event.findMany({
    where: { ...(category && { category }), ...(status && { status }) },
    include: { _count: { select: { rsvps: true } } },
    orderBy: { date: 'asc' },
  });
  const rsvps = await prisma.eventRSVP.findMany({
    where: { userId: req.user!.id, eventId: { in: events.map((event) => event.id) } },
    select: { eventId: true, going: true },
  });
  const rsvpByEvent = new Map(rsvps.map((rsvp) => [rsvp.eventId, rsvp.going]));
  res.json(events.map((event) => ({ ...event, myRsvp: rsvpByEvent.get(event.id) ?? null })));
};

export const getEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  const eventId = idParam(req.params.id, 'eventId');
  const event = await eventWithRsvp(eventId, req.user!.id);
  if (!event) throw new HttpError(404, 'Event not found');

  if (req.user!.role === 'STUDENT') {
    res.json(event);
    return;
  }
  const rsvps = await prisma.eventRSVP.findMany({
    where: { eventId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ ...event, rsvps });
};

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  const title = requiredString(req.body.title, 'title');
  const description = optionalString(req.body.description, 'description', 65535);
  const date = dateValue(req.body.date, 'date')!;
  const endDate = dateValue(req.body.endDate, 'endDate', false);
  const category = enumValue(req.body.category, 'category', eventCategories);
  const organizer = requiredString(req.body.organizer, 'organizer');
  if (endDate && endDate < date) throw new HttpError(400, 'endDate cannot be before date');

  const event = await prisma.event.create({ data: { title, description, date, endDate, category, organizer } });
  res.status(201).json(event);
};

export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  const eventId = idParam(req.params.id, 'eventId');
  const current = await prisma.event.findUnique({ where: { id: eventId } });
  if (!current) throw new HttpError(404, 'Event not found');

  const title = req.body.title === undefined ? undefined : requiredString(req.body.title, 'title');
  const description = req.body.description === undefined ? undefined : optionalString(req.body.description, 'description', 65535);
  const date = req.body.date === undefined ? undefined : dateValue(req.body.date, 'date');
  const endDate = req.body.endDate === undefined ? undefined : dateValue(req.body.endDate, 'endDate', false);
  const category = req.body.category === undefined ? undefined : enumValue(req.body.category, 'category', eventCategories);
  const status = req.body.status === undefined ? undefined : enumValue(req.body.status, 'status', eventStatuses);
  const organizer = req.body.organizer === undefined ? undefined : requiredString(req.body.organizer, 'organizer');
  const nextDate = date ?? current.date;
  if (endDate && endDate < nextDate) throw new HttpError(400, 'endDate cannot be before date');

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description ?? null }),
      ...(date !== undefined && { date }),
      ...(endDate !== undefined && { endDate: endDate ?? null }),
      ...(category !== undefined && { category }),
      ...(status !== undefined && { status }),
      ...(organizer !== undefined && { organizer }),
    },
  });
  res.json(event);
};

export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  const eventId = idParam(req.params.id, 'eventId');
  const existing = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!existing) throw new HttpError(404, 'Event not found');
  await prisma.event.delete({ where: { id: eventId } });
  res.json({ message: 'Event deleted' });
};

export const rsvpEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  const eventId = idParam(req.params.id, 'eventId');
  const going = booleanValue(req.body.going, 'going');
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new HttpError(404, 'Event not found');
  const rsvp = await prisma.eventRSVP.upsert({
    where: { eventId_userId: { eventId, userId: req.user!.id } },
    update: { going },
    create: { eventId, userId: req.user!.id, going },
  });
  res.json(rsvp);
};
