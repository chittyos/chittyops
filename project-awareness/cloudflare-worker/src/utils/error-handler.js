/**
 * Error Handler Utility
 * Centralized error handling and logging
 */

import { CorsHandler } from './cors.js';

export class ErrorHandler {
  static handle(error, context = 'UNKNOWN_ERROR', env = null) {
    console.error(`Error in ${context}:`, error);

    // Determine error type and appropriate response
    const errorResponse = ErrorHandler.createErrorResponse(error, context);
    
    // Add CORS headers
    return CorsHandler.addCorsHeaders(errorResponse, env);
  }

  static createErrorResponse(error, context) {
    let statusCode = 500;
    let errorType = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details = null;

    // Handle different error types
    if (error.name === 'ValidationError' || error.message.includes('Invalid')) {
      statusCode = 400;
      errorType = 'VALIDATION_ERROR';
      message = error.message || 'Invalid request data';
    } else if (error.name === 'AuthenticationError' || context.includes('AUTH')) {
      statusCode = 401;
      errorType = 'AUTHENTICATION_ERROR';
      message = 'Authentication failed';
    } else if (error.name === 'AuthorizationError' || context.includes('PERMISSION')) {
      statusCode = 403;
      errorType = 'AUTHORIZATION_ERROR';
      message = 'Insufficient permissions';
    } else if (error.name === 'NotFoundError' || context.includes('NOT_FOUND')) {
      statusCode = 404;
      errorType = 'NOT_FOUND_ERROR';
      message = 'Resource not found';
    } else if (error.name === 'ConflictError' || context.includes('CONFLICT')) {
      statusCode = 409;
      errorType = 'CONFLICT_ERROR';
      message = 'Resource conflict';
    } else if (error.name === 'RateLimitError' || context.includes('RATE_LIMIT')) {
      statusCode = 429;
      errorType = 'RATE_LIMIT_ERROR';
      message = 'Rate limit exceeded';
    } else if (error.name === 'TimeoutError' || context.includes('TIMEOUT')) {
      statusCode = 504;
      errorType = 'TIMEOUT_ERROR';
      message = 'Request timeout';
    } else if (error.name === 'NetworkError' || context.includes('NETWORK')) {
      statusCode = 503;
      errorType = 'SERVICE_UNAVAILABLE';
      message = 'Service temporarily unavailable';
    }

    // Include stack trace in development
    if (process.env.NODE_ENV !== 'production') {
      details = {
        stack: error.stack,
        context: context
      };
    }

    const errorBody = {
      success: false,
      error: {
        type: errorType,
        message: message,
        context: context,
        timestamp: new Date().toISOString(),
        ...(details && { details })
      }
    };

    return new Response(JSON.stringify(errorBody, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Handle async errors with context
   */
  static async handleAsync(asyncFn, context = 'ASYNC_OPERATION', env = null) {
    try {
      return await asyncFn();
    } catch (error) {
      return ErrorHandler.handle(error, context, env);
    }
  }

  /**
   * Validate request data
   */
  static validateRequest(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Required field validation
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Field '${field}' is required`);
        continue;
      }

      // Skip further validation if field is not present and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`Field '${field}' must be of type ${rules.type}`);
        continue;
      }

      // String length validation
      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push(`Field '${field}' must be at least ${rules.minLength} characters long`);
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`Field '${field}' must be at most ${rules.maxLength} characters long`);
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`Field '${field}' must be one of: ${rules.enum.join(', ')}`);
      }

      // Pattern validation
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
        errors.push(`Field '${field}' format is invalid`);
      }

      // Custom validation
      if (rules.validate && typeof rules.validate === 'function') {
        const customError = rules.validate(value);
        if (customError) {
          errors.push(`Field '${field}': ${customError}`);
        }
      }
    }

    if (errors.length > 0) {
      const error = new Error(`Validation failed: ${errors.join(', ')}`);
      error.name = 'ValidationError';
      error.errors = errors;
      throw error;
    }

    return true;
  }

  /**
   * Log error with context
   */
  static logError(error, context, additionalInfo = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      context: context,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      ...additionalInfo
    };

    console.error('Error Log:', JSON.stringify(logEntry, null, 2));
    
    // In production, you might want to send this to an external logging service
    return logEntry;
  }

  /**
   * Create custom error classes
   */
  static createError(type, message, statusCode = 500) {
    const error = new Error(message);
    error.name = type;
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Authentication error
   */
  static authenticationError(message = 'Authentication failed') {
    return ErrorHandler.createError('AuthenticationError', message, 401);
  }

  /**
   * Authorization error
   */
  static authorizationError(message = 'Insufficient permissions') {
    return ErrorHandler.createError('AuthorizationError', message, 403);
  }

  /**
   * Validation error
   */
  static validationError(message) {
    return ErrorHandler.createError('ValidationError', message, 400);
  }

  /**
   * Not found error
   */
  static notFoundError(resource = 'Resource') {
    return ErrorHandler.createError('NotFoundError', `${resource} not found`, 404);
  }

  /**
   * Conflict error
   */
  static conflictError(message) {
    return ErrorHandler.createError('ConflictError', message, 409);
  }

  /**
   * Rate limit error
   */
  static rateLimitError(message = 'Rate limit exceeded') {
    return ErrorHandler.createError('RateLimitError', message, 429);
  }

  /**
   * Service unavailable error
   */
  static serviceUnavailableError(service = 'Service') {
    return ErrorHandler.createError('ServiceUnavailableError', `${service} is temporarily unavailable`, 503);
  }

  /**
   * Timeout error
   */
  static timeoutError(operation = 'Operation') {
    return ErrorHandler.createError('TimeoutError', `${operation} timed out`, 504);
  }

  /**
   * Network error
   */
  static networkError(message = 'Network error occurred') {
    return ErrorHandler.createError('NetworkError', message, 503);
  }
}