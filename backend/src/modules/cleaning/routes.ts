import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/',               asyncHandler(ctrl.listRequests));
router.get('/:id',            asyncHandler(ctrl.getRequest));
router.post('/',              asyncHandler(ctrl.createRequest));
router.put('/:id',            authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateRequest));
router.post('/:id/assign',    authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.assignRequest));
router.post('/:id/complete',  authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.completeRequest));
router.post('/:id/feedback',  asyncHandler(ctrl.submitFeedback));

export default router;
