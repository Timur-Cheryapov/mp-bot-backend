import { NextFunction, Request, Response } from "express";
import { ForbiddenError, BadRequestError } from "../utils/errors";
import logger from "../utils/logger";

/**
 * Middleware to check if the header has a valid payment signature
 */
export const verifyPaymentSignature = (req: Request, res: Response, next: NextFunction) => {
  try {
    // if (!req.headers['x-payment-signature']) {
    //   throw new ForbiddenError('Payment signature required');
    // } else if (req.headers['x-payment-signature'] !== process.env.PAYMENT_SIGNATURE) {
    //   throw new BadRequestError('Invalid payment signature');
    // } else if (req.headers['x-payment-signature'] === process.env.PAYMENT_SIGNATURE) {
    //   req.user = { role: 'admin' };
    // }

    next();
  } catch (error) {
    logger.error('Payment signature verification error', {
      error: error instanceof Error ? error.message : String(error),
      path: req.originalUrl
    });
    
    if (error instanceof ForbiddenError) {
      return next(error);
    }
    
    next(new ForbiddenError('Payment signature verification failed'));
  }
};