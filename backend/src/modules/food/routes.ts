import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/menu',                  asyncHandler(ctrl.getWeeklyMenu));
router.put('/menu/:day',             authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateMenuDay));
router.get('/subscriptions',         asyncHandler(ctrl.listSubscriptions));
router.post('/subscriptions',        authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.createSubscription));
router.put('/subscriptions/:id',     authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateSubscription));
router.post('/subscriptions/:id/pay',authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.markSubscriptionPaid));

export default router;
