import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/dashboard',        asyncHandler(ctrl.getDashboard));
router.get('/users',            asyncHandler(ctrl.listUsers));
router.put('/users/:id',        asyncHandler(ctrl.updateUser));
router.delete('/users/:id',     asyncHandler(ctrl.deleteUser));
router.put('/users/:id/toggle', asyncHandler(ctrl.toggleUserStatus));
router.get('/audit-logs',       asyncHandler(ctrl.getAuditLogs));

export default router;
