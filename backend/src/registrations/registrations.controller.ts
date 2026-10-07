import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CURRENT_USER_REQUEST_KEY } from '../auth/models/auth.models.js';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { ExportService } from './export.service.js';
import { MESSAGES } from './messages.js';
import { RegistrationsService } from './registrations.service.js';

type AuthenticatedRequest = Request & {
  [CURRENT_USER_REQUEST_KEY]?: AuthenticatedUser;
};

@Controller('api')
export class RegistrationsController {
  constructor(
    @Inject(RegistrationsService) private readonly registrations: RegistrationsService,
    @Inject(ExportService) private readonly exports: ExportService,
  ) {}

  @Post('events/:eventId/registrations')
  register(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.registrations.register(request[CURRENT_USER_REQUEST_KEY], eventId, body);
  }

  /** SPM-120: the attendee withdraws their own registration. Accepts no body or {}. */
  @Post('registrations/:registrationId/withdraw')
  @HttpCode(200)
  withdraw(
    @Param('registrationId') registrationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.registrations.withdraw(request[CURRENT_USER_REQUEST_KEY], registrationId, body);
  }

  @Get('events/:eventId/registrations/me')
  mine(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.registrations.findMine(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  /** SPM-63: the registration report for an event the caller manages (assigned coordinator or owning organiser). */
  @Get('events/:eventId/registrations/report')
  @Header('Cache-Control', 'no-store')
  report(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    return this.registrations.getReport(request[CURRENT_USER_REQUEST_KEY], eventId);
  }

  /**
   * SPM-63: the same report as a CSV or PDF download. It goes through the same getReport call as the screen, so
   * the access rule and the rows are identical; the format is checked only after access is granted.
   */
  @Get('events/:eventId/registrations/report/export')
  @Header('Cache-Control', 'no-store')
  async export(
    @Param('eventId') eventId: string,
    @Query('format') format: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.registrations.getReport(request[CURRENT_USER_REQUEST_KEY], eventId);
    if (format !== 'csv' && format !== 'pdf') throw new BadRequestException(MESSAGES.exportFormatInvalid);

    const body = format === 'csv' ? this.exports.csv(report) : await this.exports.pdf(report);
    response.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf');
    response.setHeader('Content-Disposition', this.exports.contentDisposition(report, format));
    return new StreamableFile(body);
  }
}
