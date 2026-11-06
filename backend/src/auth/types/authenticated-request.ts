import type { Request } from 'express';
import {
  CURRENT_USER_REQUEST_KEY,
  type AuthenticatedUser,
} from './auth.models.js';

/** Express request after the authentication middleware has attached the account. */
export type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};
