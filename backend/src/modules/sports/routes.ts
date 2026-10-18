import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/issues/all',  authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.listIssues));
router.get('/',            asyncHandler(ctrl.listEquipment));
router.get('/:id',         asyncHandler(ctrl.getEquipment));
router.post('/',           authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.addEquipment));
router.put('/:id',         authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateEquipment));
router.delete('/:id',      authorize('ADMIN'),          asyncHandler(ctrl.deleteEquipment));
router.post('/:id/issue',  authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.issueEquipment));
router.post('/:id/return', authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.returnEquipment));

export default router;
