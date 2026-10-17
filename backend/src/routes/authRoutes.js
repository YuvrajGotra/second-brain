import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authenticateUser } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/logout', auth.logout);

router.get('/me', authenticateUser, auth.me);
router.patch('/me', authenticateUser, validate({ body: updateProfileSchema }), auth.updateProfile);
router.put('/password', authenticateUser, authLimiter, validate({ body: changePasswordSchema }), auth.changePassword);
router.delete('/me', authenticateUser, authLimiter, validate({ body: deleteAccountSchema }), auth.deleteAccount);

export default router;
