/*
 * SPM-63 CSV and PDF writers for the registration report (AC4). Both are built from the one
 * RegistrationReport the screen shows (same rows, same order), so the three channels cannot disagree.
 * Authorization is not decided here: the service that builds the report has already applied
 * canViewEventRegistrations. Time is an input (report.generatedAt), never read from the wall clock.
 */
import { Injectable } from '@nestjs/common';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { MESSAGES } from './messages.js';
import { neutralizeCsvCell } from './sanitization.js';
import {
  attendeeCountLine,
  formatReportDateTime,
  formatReportDateTimeSgt,
  formatReportEventRange,
  formatReportGenerated,
  spotsLine,
} from './report-format.js';
import type { ExportFormat, RegistrationReport } from './report-types.js';

// Noto Sans (SIL OFL, backend/assets/fonts) is embedded so Latin-extended names render; the standard PDF fonts
// cannot draw them reliably. It has no CJK coverage (Q4), which is listed as a known gap.
const FONT_PATH = fileURLToPath(new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url));

const BOM = '﻿';
const CRLF = '\r\n';
export const CSV_HEADER = [
  'Name',
  'Email',
  'Contact Number',
  'Special Requirements',
  'Registration Date',
  'Status',
] as const;

/** Neutralise a formula, then quote per RFC 4180 (comma, quote, CR or LF force quotes; inner quotes double). */
export function toCsvCell(value: string): string {
  const cell = neutralizeCsvCell(value);
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** UTF-8 with BOM, CRLF after every record including the last (D9). Rows keep the report's order. */
export function buildCsv(report: RegistrationReport): Buffer {
  const rows = report.registrations.map((row) =>
    [
      row.fullName,
      row.email,
      row.contactNumber,
      row.specialRequirements ?? '',
      formatReportDateTime(new Date(row.registeredAt)),
      row.status,
    ]
      .map(toCsvCell)
      .join(','),
  );
  const lines = [CSV_HEADER.join(','), ...rows];
  return Buffer.from(`${BOM}${lines.map((line) => line + CRLF).join('')}`, 'utf8');
}

/** "<event_name>_registrations.<csv|pdf>": the event name lowercased with spaces as underscores and unsafe characters removed. */
export function reportFilename(eventName: string, format: ExportFormat): string {
  const safe = eventName
    .toLowerCase()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  return `${safe || 'event'}_registrations.${format}`;
}

/** Content-Disposition value: an ASCII `filename` fallback plus the exact UTF-8 name in `filename*` (RFC 6266). */
export function reportContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const PDF_MARGIN = 40;
// A4 landscape: 842 - 2 x 40 margin = 762 pt of table width, so the six columns below must sum to at most 762.
const PDF_COLUMNS = [
  { title: 'Name', width: 110 },
  { title: 'Email', width: 155 },
  { title: 'Contact Number', width: 85 },
  { title: 'Special Requirements', width: 205 },
  { title: 'Registration Date', width: 135 },
  { title: 'Status', width: 70 },
] as const;
const CELL_GAP = 0;

/** A printable PDF: header, summary and a table with the same rows, order and wording as the screen (R11). */
export function buildPdf(report: RegistrationReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const generatedAt = new Date(report.generatedAt);
    // Metadata dates come from the report's own instant so two runs of the same report are byte-comparable.
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: PDF_MARGIN,
      info: { Title: `${report.event.name} - Registration Report`, CreationDate: generatedAt, ModDate: generatedAt },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('body', FONT_PATH);
    doc.font('body');
    doc.fontSize(16).text(`${report.event.name} - Registration Report`);
    doc.moveDown(0.5).fontSize(10);
    doc.text(formatReportEventRange(new Date(report.event.startDateTime), new Date(report.event.endDateTime)));
    doc.text(formatReportGenerated(generatedAt));
    doc.text(attendeeCountLine(report.totalConfirmed, report.event.capacity));
    doc.text(spotsLine(report.availableSpots));
    doc.moveDown();

    if (report.registrations.length === 0) {
      doc.text(MESSAGES.reportEmptyPdf);
      doc.end();
      return;
    }

    const bottom = doc.page.height - PDF_MARGIN;
    const drawRow = (cells: string[]) => {
      const heights = cells.map((cell, i) => doc.heightOfString(cell, { width: PDF_COLUMNS[i].width - 4 }));
      const rowHeight = Math.max(...heights) + 4;
      if (doc.y + rowHeight > bottom) {
        doc.addPage();
        drawRow(PDF_COLUMNS.map((c) => c.title));
        return drawRowAt(cells, rowHeight);
      }
      drawRowAt(cells, rowHeight);
    };
    const drawRowAt = (cells: string[], rowHeight: number) => {
      const top = doc.y;
      let x = PDF_MARGIN;
      cells.forEach((cell, i) => {
        doc.text(cell, x, top, { width: PDF_COLUMNS[i].width - 4 });
        x += PDF_COLUMNS[i].width + CELL_GAP;
      });
      doc.x = PDF_MARGIN;
      doc.y = top + rowHeight;
    };

    drawRow(PDF_COLUMNS.map((c) => c.title));
    for (const row of report.registrations) {
      drawRow([
        row.fullName,
        row.email,
        row.contactNumber,
        row.specialRequirements ?? '',
        formatReportDateTimeSgt(new Date(row.registeredAt)),
        row.status,
      ]);
    }
    doc.end();
  });
}

@Injectable()
export class ExportService {
  csv(report: RegistrationReport): Buffer {
    return buildCsv(report);
  }

  pdf(report: RegistrationReport): Promise<Buffer> {
    return buildPdf(report);
  }

  filename(report: RegistrationReport, format: ExportFormat): string {
    return reportFilename(report.event.name, format);
  }

  contentDisposition(report: RegistrationReport, format: ExportFormat): string {
    return reportContentDisposition(this.filename(report, format));
  }
}
