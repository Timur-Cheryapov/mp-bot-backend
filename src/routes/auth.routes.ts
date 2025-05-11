import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { 
  asyncHandler, 
  authenticate, 
  authRateLimiter, 
  trackLoginAttempts,
  csrfProtection
} from '../middleware';
import { validate } from '../middleware/validator';
import { body } from 'express-validator';

const router = Router();

// Validation rules
const signupValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Password is required')
];

const emailValidation = [
  body('email').isEmail().withMessage('Please provide a valid email')
];

const passwordValidation = [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

/**
 * @route POST /api/auth/signup
 * @desc Register a new user
 * @access Public
 */
router.post('/signup', authRateLimiter, csrfProtection, validate(signupValidation), asyncHandler(authController.signup));

/**
 * @route POST /api/auth/login
 * @desc Authenticate user & get token
 * @access Public
 */
router.post('/login', authRateLimiter, trackLoginAttempts, validate(loginValidation), asyncHandler(authController.login));

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Public
 */
router.post('/logout', csrfProtection, asyncHandler(authController.logout));

/**
 * @route POST /api/auth/reset-password
 * @desc Request password reset
 * @access Public
 */
router.post('/reset-password', validate(emailValidation), asyncHandler(authController.resetPassword));

/**
 * @route POST /api/auth/update-password
 * @desc Update password (after reset)
 * @access Private
 */
router.post('/update-password', authenticate, csrfProtection, validate(passwordValidation), asyncHandler(authController.updatePassword));

/**
 * @route GET /api/auth/me
 * @desc Get current user details
 * @access Private
 */
router.get('/me', authenticate, asyncHandler(authController.me));

/**
 * @route GET /api/auth/csrf-token
 * @desc Get a CSRF token for form submissions
 * @access Public
 */
router.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

export default router; 