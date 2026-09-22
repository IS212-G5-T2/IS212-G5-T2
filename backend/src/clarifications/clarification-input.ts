import { BadRequestException } from '@nestjs/common';

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Validates a clarification or reply message body.
 *
 * @param input - Raw request body.
 * @param blankErrorMessage - Error text shown when the message is blank or
 * whitespace-only, so callers can word it for clarifications vs. replies.
 * @returns The trimmed, non-blank message.
 * @throws BadRequestException when the message is blank/whitespace-only or exceeds the length limit.
 */
export function validateMessage(
  input: unknown,
  blankErrorMessage: string,
): string {
  const data = (
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  ) as Record<string, unknown>;
  const raw = data.message;
  const message = typeof raw === 'string' ? raw.trim() : '';

  if (!message) {
    throw new BadRequestException({
      message: blankErrorMessage,
      errors: { message: blankErrorMessage },
    });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    const error = `Use ${MAX_MESSAGE_LENGTH} characters or fewer.`;
    throw new BadRequestException({ message: error, errors: { message: error } });
  }

  return message;
}
