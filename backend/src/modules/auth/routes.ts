import { Router } from 'express';
import { login, register, forgotPassword, resetPassword } from './controller';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

router.post('/login',           asyncHandler(login));
router.post('/register',        asyncHandler(register));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password',  asyncHandler(resetPassword));

export default router;
