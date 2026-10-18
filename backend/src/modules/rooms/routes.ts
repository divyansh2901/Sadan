import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/',              asyncHandler(ctrl.listRooms));
router.get('/:id',           asyncHandler(ctrl.getRoom));
router.post('/',             authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.createRoom));
router.put('/:id',           authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateRoom));
router.delete('/:id',        authorize('ADMIN'),          asyncHandler(ctrl.deleteRoom));
router.post('/:id/allocate', authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.allocateRoom));
router.post('/:id/transfer', authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.transferRoom));

export default router;
