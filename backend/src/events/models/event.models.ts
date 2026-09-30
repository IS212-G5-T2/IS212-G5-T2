/** Metadata for an attachment included in an event request or draft. */
export interface EventAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}
