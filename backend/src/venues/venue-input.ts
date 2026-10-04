import { BadRequestException } from '@nestjs/common';
import { accessibilityLabels } from './accessibility-options.js';
import { facilityNames, roomLayoutNames } from './venue-options.js';

const MAX_DURATION_MINUTES = 2_147_483_647;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface VenueImageInput {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** Validated data required to persist a venue catalogue record. */
export interface VenueInput {
  name: string;
  location: string;
  capacity: number;
  facilities: string[];
  accessibility: string[];
  layouts: string[];
  operatingHours: string;
  setupTimeMinutes: number;
  turnaroundTimeMinutes: number;
  image?: VenueImageInput;
}

/** Fields that are required to create a venue. */
export const venueFields = [
  'name',
  'location',
  'capacity',
  'facilities',
  'accessibility',
  'layouts',
  'operatingHours',
  'setupTimeMinutes',
  'turnaroundTimeMinutes',
] as const;

/**
 * Validates and normalizes untrusted venue-creation input.
 *
 * @param value - Request payload supplied by the client.
 * @returns A normalized, persistence-ready venue.
 * @throws BadRequestException when a field is missing or invalid.
 */
export function validateVenue(value: unknown): VenueInput {
  const body =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const errors: Record<string, string> = {};
  const text = (key: string, max: number): string => {
    const input = body[key];
    if (typeof input !== 'string' || !input.trim()) {
      errors[key] = 'This field is required.';
      return '';
    }
    const trimmed = input.trim();
    if (trimmed.length > max)
      errors[key] = `Must be ${max} characters or fewer.`;
    return trimmed;
  };
  const array = (key: string): string[] => {
    const input = body[key];
    if (
      !Array.isArray(input) ||
      input.length === 0 ||
      input.some((item) => typeof item !== 'string' || !item.trim())
    ) {
      errors[key] = 'Enter at least one value.';
      return [];
    }
    const items = input.map((item: string) => item.trim());
    if (items.length > 20 || items.some((item) => item.length > 100))
      errors[key] = 'Use at most 20 values of 100 characters or fewer.';
    return items;
  };
  const name = text('name', 200);
  const location = text('location', 300);
  const operatingHours = text('operatingHours', 200);
  const duration = (key: 'setupTimeMinutes' | 'turnaroundTimeMinutes') => {
    const input = body[key];
    if (
      !Number.isSafeInteger(input) ||
      (input as number) < 0 ||
      (input as number) > MAX_DURATION_MINUTES
    ) {
      errors[key] = 'Enter a valid duration in whole minutes (0 or more).';
      return 0;
    }
    return input as number;
  };
  const setupTimeMinutes = duration('setupTimeMinutes');
  const turnaroundTimeMinutes = duration('turnaroundTimeMinutes');
  const capacity = body.capacity;
  if (
    !Number.isSafeInteger(capacity) ||
    (capacity as number) < 1 ||
    (capacity as number) > 1_000_000
  )
    errors.capacity = 'Enter a whole number from 1 to 1000000.';
  const facilities = array('facilities');
  if (facilities.some((facility) => !facilityNames.includes(facility)))
    errors.facilities = 'Choose one or more supported facilities.';
  const accessibility = array('accessibility');
  if (accessibility.some((feature) => !accessibilityLabels.includes(feature)))
    errors.accessibility =
      'Choose one or more supported accessibility features.';
  const layouts = array('layouts');
  if (layouts.some((layout) => !roomLayoutNames.includes(layout)))
    errors.layouts = 'Choose one or more supported room layouts.';
  const imageValue = body.image;
  let image: VenueImageInput | undefined;
  if (imageValue !== undefined && imageValue !== null) {
    const candidate =
      typeof imageValue === 'object' && !Array.isArray(imageValue)
        ? (imageValue as Record<string, unknown>)
        : {};
    const name =
      typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const type =
      typeof candidate.type === 'string' ? candidate.type.trim() : '';
    const size = candidate.size;
    const dataUrl =
      typeof candidate.dataUrl === 'string' ? candidate.dataUrl.trim() : '';
    const dataUrlMatch = dataUrl.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/]*={0,2})$/,
    );
    const base64 = dataUrlMatch?.[2] ?? '';
    const decodedSize = base64
      ? Math.floor((base64.length * 3) / 4) -
        (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
      : 0;
    if (
      !name ||
      name.length > 255 ||
      !type.startsWith('image/') ||
      type.length > 100 ||
      !Number.isSafeInteger(size) ||
      (size as number) < 1 ||
      (size as number) > MAX_IMAGE_BYTES ||
      !dataUrlMatch ||
      base64.length % 4 !== 0 ||
      dataUrlMatch[1] !== type ||
      decodedSize !== size
    ) {
      errors.image = 'Upload one valid image of 5 MB or less.';
    } else {
      image = { name, type, size: size as number, dataUrl };
    }
  }
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Check the venue details.',
      errors,
    });
  return {
    name,
    location,
    capacity: capacity as number,
    facilities,
    accessibility,
    layouts,
    operatingHours,
    setupTimeMinutes,
    turnaroundTimeMinutes,
    image,
  };
}
