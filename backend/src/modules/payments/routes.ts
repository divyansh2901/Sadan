import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.post('/check-overdue',  authorize('ADMIN'),          asyncHandler(ctrl.checkOverdue));
router.get('/',                asyncHandler(ctrl.listPayments));
router.get('/:id',             asyncHandler(ctrl.getPayment));
router.post('/',               authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.createPayment));
router.put('/:id',             authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updatePayment));
router.post('/:id/pay',        authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.markPaid));

export default router;
