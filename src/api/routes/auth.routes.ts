import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { signupSchema, loginSchema, refreshSchema } from '../validators/auth.validators';
import { signup, login, refresh, me, logout } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/signup',  validate(signupSchema),  signup);
router.post('/register', validate(signupSchema), signup); // alias
router.post('/login',   validate(loginSchema),   login);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout',  logout);
router.get('/me',       authenticate,            me);

export default router;
