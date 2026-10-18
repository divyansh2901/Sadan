import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function ensureEvent(data: Parameters<typeof prisma.event.create>[0]['data']) {
  const existing = await prisma.event.findFirst({ where: { title: data.title } });
  if (existing) return prisma.event.update({ where: { id: existing.id }, data });
  return prisma.event.create({ data });
}

async function ensureEquipment(data: Parameters<typeof prisma.sportsEquipment.create>[0]['data']) {
  const existing = await prisma.sportsEquipment.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return prisma.sportsEquipment.create({ data });
}

async function ensurePayment(data: Parameters<typeof prisma.payment.create>[0]['data']) {
  const existing = await prisma.payment.findFirst({
    where: { studentId: data.studentId, type: data.type, dueDate: data.dueDate },
  });
  if (existing) return existing;
  return prisma.payment.create({ data });
}

async function ensureCleaningRequest(data: Parameters<typeof prisma.cleaningRequest.create>[0]['data']) {
  const existing = await prisma.cleaningRequest.findFirst({
    where: { studentId: data.studentId, roomNumber: data.roomNumber, type: data.type, priority: data.priority },
  });
  if (existing) return existing;
  return prisma.cleaningRequest.create({ data });
}

async function main() {
  console.log('🌱 Seeding HostelPro reference data...');
  const hash = (password: string) => bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: 'admin@hostel.com' },
    update: { name: 'Admin', role: 'ADMIN', isActive: true },
    create: { email: 'admin@hostel.com', passwordHash: await hash('Admin@123'), name: 'Admin', role: 'ADMIN' },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@hostel.com' },
    update: { name: 'Rajesh Kumar', role: 'STAFF', isActive: true },
    create: {
      email: 'staff@hostel.com', passwordHash: await hash('Staff@123'), name: 'Rajesh Kumar', role: 'STAFF',
      staff: { create: { department: 'CLEANING' } },
    },
    include: { staff: true },
  });
  const staff = staffUser.staff ?? await prisma.staff.create({ data: { userId: staffUser.id, department: 'CLEANING' } });

  const rooms = await Promise.all([
    prisma.room.upsert({ where: { number: 'A-101' }, update: { type: 'SINGLE', floor: 1, capacity: 1, rent: 8000, amenities: '["AC","WiFi","Attached Bath"]' }, create: { number: 'A-101', type: 'SINGLE', floor: 1, capacity: 1, rent: 8000, amenities: '["AC","WiFi","Attached Bath"]' } }),
    prisma.room.upsert({ where: { number: 'B-201' }, update: { type: 'DOUBLE', floor: 2, capacity: 2, rent: 5500, amenities: '["Fan","WiFi"]' }, create: { number: 'B-201', type: 'DOUBLE', floor: 2, capacity: 2, rent: 5500, amenities: '["Fan","WiFi"]' } }),
    prisma.room.upsert({ where: { number: 'C-301' }, update: { type: 'SHARED', floor: 3, capacity: 4, rent: 3500, amenities: '["Fan"]' }, create: { number: 'C-301', type: 'SHARED', floor: 3, capacity: 4, rent: 3500, amenities: '["Fan"]' } }),
    prisma.room.upsert({ where: { number: 'A-102' }, update: { type: 'SINGLE', floor: 1, capacity: 1, rent: 8000, amenities: '["AC","WiFi","Attached Bath"]' }, create: { number: 'A-102', type: 'SINGLE', floor: 1, capacity: 1, rent: 8000, amenities: '["AC","WiFi","Attached Bath"]' } }),
  ]);

  const studentData = [
    { email: 'arjun@student.com', name: 'Arjun Sharma', course: 'B.Tech CSE', year: 2 },
    { email: 'priya@student.com', name: 'Priya Patel', course: 'MBA', year: 1 },
    { email: 'rohit@student.com', name: 'Rohit Verma', course: 'B.Com', year: 3 },
  ];

  const students = [];
  for (let index = 0; index < studentData.length; index += 1) {
    const data = studentData[index];
    const existing = await prisma.user.findUnique({ where: { email: data.email }, include: { student: true } });
    const user = existing ?? await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hash('Student@123'),
        name: data.name,
        role: 'STUDENT',
        student: { create: { course: data.course, year: data.year, joinDate: new Date('2024-07-01') } },
      },
      include: { student: true },
    });
    const student = user.student ?? await prisma.student.create({
      data: { userId: user.id, course: data.course, year: data.year, joinDate: new Date('2024-07-01') },
    });
    await prisma.student.update({ where: { id: student.id }, data: { course: data.course, year: data.year, roomId: rooms[index].id } });
    students.push({ ...student, roomId: rooms[index].id });
  }

  await Promise.all([
    ensureEvent({ title: 'Annual Sports Day', description: 'Inter-hostel tournament', date: new Date('2026-12-15'), category: 'SPORTS', organizer: 'Admin', status: 'UPCOMING' }),
    ensureEvent({ title: 'Cultural Night', description: 'Music and food festival', date: new Date('2026-11-25'), category: 'CULTURAL', organizer: 'Student Council', status: 'UPCOMING' }),
    ensureEvent({ title: 'Monthly Meeting', description: 'Hostel announcements', date: new Date('2026-10-10'), category: 'MEETING', organizer: 'Warden', status: 'COMPLETED' }),
  ]);

  await Promise.all([
    ensureEquipment({ name: 'Basketball', total: 6, available: 6, condition: 'GOOD' }),
    ensureEquipment({ name: 'Football', total: 4, available: 4, condition: 'EXCELLENT' }),
    ensureEquipment({ name: 'Cricket Bat', total: 8, available: 8, condition: 'GOOD' }),
    ensureEquipment({ name: 'Badminton Racket', total: 12, available: 12, condition: 'GOOD' }),
  ]);

  for (const student of students) {
    const room = rooms.find((candidate) => candidate.id === student.roomId);
    if (!room) continue;
    await ensurePayment({ studentId: student.id, roomId: room.id, amount: room.rent, type: 'MONTHLY', status: 'PAID', dueDate: new Date('2026-01-01'), paidDate: new Date('2026-01-01'), paymentMethod: 'UPI' });
    await ensurePayment({ studentId: student.id, roomId: room.id, amount: room.rent, type: 'MONTHLY', status: 'PENDING', dueDate: new Date('2026-02-01') });
  }

  const firstStudent = students[0];
  if (firstStudent) {
    await ensureCleaningRequest({ studentId: firstStudent.id, roomNumber: 'A-101', type: 'REGULAR', priority: 'HIGH', status: 'PENDING' });
  }

  // Recompute occupancy from student assignments rather than incrementing counters.
  for (const room of rooms) {
    const occupied = await prisma.student.count({ where: { roomId: room.id } });
    await prisma.room.update({ where: { id: room.id }, data: { occupied, status: occupied >= room.capacity ? 'FULL' : 'AVAILABLE' } });
  }

  console.log('✅ Seed complete. Existing records were reused where possible.');
  console.log(`Staff profile ready: ${staff.department}`);
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
