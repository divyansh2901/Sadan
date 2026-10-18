import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/',          asyncHandler(ctrl.listEvents));
router.get('/:id',       asyncHandler(ctrl.getEvent));
router.post('/',         authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.createEvent));
router.put('/:id',       authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateEvent));
router.delete('/:id',    authorize('ADMIN'),          asyncHandler(ctrl.deleteEvent));
router.post('/:id/rsvp', asyncHandler(ctrl.rsvpEvent));

export default router;
