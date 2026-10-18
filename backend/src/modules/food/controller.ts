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
  positiveAmount,
  requiredString,
} from '../../utils/validation';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const mealPlans = ['MONTHLY', 'DAILY', 'ONE_TIME'] as const;

const DEFAULT_MENU: Record<string, { breakfast: string; lunch: string; dinner: string }> = {
  Monday: { breakfast: 'Idli & Sambar', lunch: 'Dal Rice', dinner: 'Roti & Sabzi' },
  Tuesday: { breakfast: 'Poha & Tea', lunch: 'Rajma Chawal', dinner: 'Khichdi' },
  Wednesday: { breakfast: 'Upma & Coffee', lunch: 'Chole Bhature', dinner: 'Fried Rice' },
  Thursday: { breakfast: 'Paratha & Curd', lunch: 'Paneer Curry', dinner: 'Chapati & Dal' },
  Friday: { breakfast: 'Bread & Omelette', lunch: 'Biryani', dinner: 'Dosa & Chutney' },
  Saturday: { breakfast: 'Puri & Halwa', lunch: 'Veg Pulao', dinner: 'Pasta' },
  Sunday: { breakfast: 'Pancakes & Juice', lunch: 'Special Thali', dinner: 'Naan & Gravy' },
};

function weekStartValue(value: unknown): Date {
  const date = value === undefined ? new Date() : dateValue(value, 'weekStart')!;
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  date.setUTCDate(diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function ensureMenu(weekStart: Date) {
  let menu = await prisma.weeklyMenu.findMany({ where: { weekStart }, orderBy: { id: 'asc' } });
  if (menu.length === 0) {
    await prisma.$transaction(
      DAYS.map((day) => prisma.weeklyMenu.create({ data: { day, weekStart, ...DEFAULT_MENU[day] } })),
    );
    menu = await prisma.weeklyMenu.findMany({ where: { weekStart }, orderBy: { id: 'asc' } });
  }
  return menu;
}

export const getWeeklyMenu = async (req: Request, res: Response): Promise<void> => {
  res.json(await ensureMenu(weekStartValue(req.query.weekStart)));
};

export const updateMenuDay = async (req: Request, res: Response): Promise<void> => {
  const day = enumValue(req.params.day, 'day', DAYS);
  const breakfast = requiredString(req.body.breakfast, 'breakfast');
  const lunch = requiredString(req.body.lunch, 'lunch');
  const dinner = requiredString(req.body.dinner, 'dinner');
  const weekStart = weekStartValue(req.body.weekStart);
  const menu = await prisma.weeklyMenu.upsert({
    where: { day_weekStart: { day, weekStart } },
    update: { breakfast, lunch, dinner },
    create: { day, weekStart, breakfast, lunch, dinner },
  });
  res.json(menu);
};

export const listSubscriptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const plan = req.query.plan === undefined ? undefined : enumValue(req.query.plan, 'plan', mealPlans);
  const isPaid = req.query.isPaid === undefined ? undefined : booleanValue(req.query.isPaid === 'true', 'isPaid');
  let studentId: number | undefined;
  if (req.user!.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!student) throw new HttpError(404, 'Student profile not found');
    studentId = student.id;
  }

  const subscriptions = await prisma.mealSubscription.findMany({
    where: { ...(studentId !== undefined && { studentId }), ...(plan && { plan }), ...(isPaid !== undefined && { isPaid }), isActive: true },
    include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } },
    orderBy: { startDate: 'desc' },
  });
  res.json(subscriptions);
};

export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  const studentId = idParam(req.body.studentId, 'studentId');
  const plan = enumValue(req.body.plan, 'plan', mealPlans);
  const startDate = dateValue(req.body.startDate, 'startDate')!;
  const endDate = dateValue(req.body.endDate, 'endDate', false);
  const amount = positiveAmount(req.body.amount);
  if (endDate && endDate < startDate) throw new HttpError(400, 'endDate cannot be before startDate');
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw new HttpError(404, 'Student not found');

  const subscription = await prisma.mealSubscription.create({
    data: { studentId, plan, amount, startDate, endDate: endDate ?? null },
    include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  res.status(201).json(subscription);
};

export const updateSubscription = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'subscriptionId');
  const current = await prisma.mealSubscription.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, 'Meal subscription not found');
  const plan = req.body.plan === undefined ? undefined : enumValue(req.body.plan, 'plan', mealPlans);
  const startDate = req.body.startDate === undefined ? undefined : dateValue(req.body.startDate, 'startDate');
  const endDate = req.body.endDate === undefined ? undefined : dateValue(req.body.endDate, 'endDate', false);
  const amount = req.body.amount === undefined ? undefined : positiveAmount(req.body.amount);
  const isPaid = req.body.isPaid === undefined ? undefined : booleanValue(req.body.isPaid, 'isPaid');
  const isActive = req.body.isActive === undefined ? undefined : booleanValue(req.body.isActive, 'isActive');
  const nextStart = startDate ?? current.startDate;
  if (endDate && endDate < nextStart) throw new HttpError(400, 'endDate cannot be before startDate');

  const subscription = await prisma.mealSubscription.update({
    where: { id },
    data: {
      ...(plan !== undefined && { plan }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate: endDate ?? null }),
      ...(amount !== undefined && { amount }),
      ...(isPaid !== undefined && { isPaid }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  res.json(subscription);
};

export const markSubscriptionPaid = async (req: Request, res: Response): Promise<void> => {
  const id = idParam(req.params.id, 'subscriptionId');
  const subscription = await prisma.mealSubscription.update({
    where: { id },
    data: { isPaid: true },
    include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  res.json(subscription);
};
