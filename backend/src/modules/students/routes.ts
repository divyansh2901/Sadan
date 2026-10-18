import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import * as ctrl from './controller';

const router = Router();
router.use(authenticate);

router.get('/me',   asyncHandler(ctrl.getMe));
router.get('/',     authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.listStudents));
router.get('/:id',  authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.getStudent));
router.post('/',    authorize('ADMIN'),          asyncHandler(ctrl.createStudent));
router.put('/:id',  authorize('ADMIN', 'STAFF'), asyncHandler(ctrl.updateStudent));
router.delete('/:id', authorize('ADMIN'),        asyncHandler(ctrl.deleteStudent));

export default router;
