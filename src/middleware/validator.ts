import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { BadRequestError } from '../utils/errors';

/**
 * Middleware that checks for validation errors
 * If errors exist, it throws a BadRequestError with details
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors for a more user-friendly response
    const formattedErrors = errors.array().map(err => {
      if ('path' in err) {
        return {
          field: err.path,
          message: err.msg,
        };
      }
      // For versions of express-validator with different error structure
      return {
        field: (err as any).param || 'unknown',
        message: err.msg,
      };
    });

    // Throw a bad request error with the formatted validation errors
    const errorMessage = 'Validation failed';
    const badRequestError = new BadRequestError(errorMessage);
    
    // Add the formatted errors to the error object
    (badRequestError as any).validationErrors = formattedErrors;
    
    next(badRequestError);
  };
};

/**
 * Sample validation schema for demonstration purposes
 * This would normally be defined in a separate validation schema file
 */
// import { body, param, query } from 'express-validator';
// export const userValidation = [
//   body('email').isEmail().withMessage('Must be a valid email'),
//   body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
// ]; 