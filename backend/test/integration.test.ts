import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('secured hostel workflows isolate students and preserve inventory', { skip: !testDatabaseUrl }, async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-only-secret-that-is-at-least-32-characters-long';

  const [{ default: app }, { prisma }, { signAccessToken }] = await Promise.all([
    import('../src/app'),
    import('../src/config/database'),
    import('../src/middleware/auth'),
  ]);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `admin-${suffix}@example.com`;
  const studentAEmail = `student-a-${suffix}@example.com`;
  const studentBEmail = `student-b-${suffix}@example.com`;
  const passwordHash = await bcrypt.hash('TestPassword@123', 10);
  const admin = await prisma.user.create({ data: { email: adminEmail, name: 'Test Admin', passwordHash, role: 'ADMIN' } });
  const room = await prisma.room.create({ data: { number: `TEST-${suffix}`, type: 'SINGLE', floor: 99, capacity: 1, rent: 1000, amenities: '[]', occupied: 0 } });
  const studentAUser = await prisma.user.create({
    data: { email: studentAEmail, name: 'Student A', passwordHash, role: 'STUDENT', student: { create: { course: 'Test', year: 1, joinDate: new Date(), roomId: room.id } } },
    include: { student: true },
  });
  const studentBUser = await prisma.user.create({
    data: { email: studentBEmail, name: 'Student B', passwordHash, role: 'STUDENT', student: { create: { course: 'Test', year: 1, joinDate: new Date() } } },
    include: { student: true },
  });
  await prisma.room.update({ where: { id: room.id }, data: { occupied: 1, status: 'FULL' } });

  const adminToken = signAccessToken({ id: admin.id, role: 'ADMIN', email: admin.email });
  const studentAToken = signAccessToken({ id: studentAUser.id, role: 'STUDENT', email: studentAUser.email });
  const studentBToken = signAccessToken({ id: studentBUser.id, role: 'STUDENT', email: studentBUser.email });

  let eventId: number | undefined;
  let equipmentId: number | undefined;
  try {
    const me = await request(app).get('/api/students/me').set('Authorization', `Bearer ${studentAToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, studentAEmail);
    assert.equal('passwordHash' in me.body.user, false);

    const studentList = await request(app).get('/api/students').set('Authorization', `Bearer ${studentAToken}`);
    assert.equal(studentList.status, 403);

    const allocation = await request(app)
      .post(`/api/rooms/${room.id}/allocate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: studentBUser.student!.id });
    assert.equal(allocation.status, 400);

    const payment = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: studentAUser.student!.id, amount: 1000, type: 'MONTHLY', dueDate: '2030-01-01' });
    assert.equal(payment.status, 201);
    const ownPayments = await request(app).get('/api/payments').set('Authorization', `Bearer ${studentAToken}`);
    assert.equal(ownPayments.status, 200);
    assert.equal(ownPayments.body.length, 1);
    const otherPayments = await request(app).get('/api/payments').set('Authorization', `Bearer ${studentBToken}`);
    assert.equal(otherPayments.status, 200);
    assert.equal(otherPayments.body.length, 0);
    const paymentMutation = await request(app)
      .put(`/api/payments/${payment.body.id}`)
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({ status: 'PAID' });
    assert.equal(paymentMutation.status, 403);

    const cleaning = await request(app)
      .post('/api/cleaning')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({ type: 'REGULAR', priority: 'MEDIUM', notes: 'Test request' });
    assert.equal(cleaning.status, 201);
    assert.equal(cleaning.body.student.user.email, studentAEmail);
    const otherCleaning = await request(app).get('/api/cleaning').set('Authorization', `Bearer ${studentBToken}`);
    assert.equal(otherCleaning.status, 200);
    assert.equal(otherCleaning.body.length, 0);

    const equipment = await request(app)
      .post('/api/sports')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Test Ball ${suffix}`, total: 1, condition: 'GOOD' });
    assert.equal(equipment.status, 201);
    equipmentId = equipment.body.id;
    const issue = await request(app)
      .post(`/api/sports/${equipmentId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: studentAUser.student!.id });
    assert.equal(issue.status, 201);
    const overIssue = await request(app)
      .post(`/api/sports/${equipmentId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: studentBUser.student!.id });
    assert.equal(overIssue.status, 400);
    const returned = await request(app)
      .post(`/api/sports/${equipmentId}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueId: issue.body.id });
    assert.equal(returned.status, 200);
    const duplicateReturn = await request(app)
      .post(`/api/sports/${equipmentId}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueId: issue.body.id });
    assert.equal(duplicateReturn.status, 400);

    const event = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `Test Event ${suffix}`, date: '2030-01-01', category: 'GENERAL', organizer: 'Test Admin' });
    assert.equal(event.status, 201);
    eventId = event.body.id;
    assert.equal((await request(app).post(`/api/events/${eventId}/rsvp`).set('Authorization', `Bearer ${studentAToken}`).send({ going: true })).status, 200);
    assert.equal((await request(app).post(`/api/events/${eventId}/rsvp`).set('Authorization', `Bearer ${studentAToken}`).send({ going: true })).status, 200);
    const events = await request(app).get('/api/events').set('Authorization', `Bearer ${studentAToken}`);
    const testEvent = events.body.find((item: { id: number }) => item.id === eventId);
    assert.equal(testEvent._count.rsvps, 1);
    assert.equal(testEvent.myRsvp, true);
  } finally {
    if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => undefined);
    if (equipmentId) {
      await prisma.equipmentIssue.deleteMany({ where: { equipmentId } });
      await prisma.sportsEquipment.delete({ where: { id: equipmentId } }).catch(() => undefined);
    }
    await prisma.cleaningRequest.deleteMany({ where: { studentId: { in: [studentAUser.student!.id, studentBUser.student!.id] } } });
    await prisma.payment.deleteMany({ where: { studentId: { in: [studentAUser.student!.id, studentBUser.student!.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, studentAUser.id, studentBUser.id] } } });
    await prisma.room.delete({ where: { id: room.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
