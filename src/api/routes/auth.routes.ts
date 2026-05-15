import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { signupSchema, loginSchema, refreshSchema } from '../validators/auth.validators';
import { signup, login, refresh } from '../controllers/auth.controller';

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);

export default router;
