import { Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from './app-error';

/** Validates a body, query or param against a shared zod schema. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const detail = error.errors
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ');
        throw AppError.validation(detail);
      }
      throw error;
    }
  }
}

/** Convenience factory so controllers read as `@Body(zodBody(schema))`. */
export const zodBody = (schema: ZodSchema) => new ZodValidationPipe(schema);
