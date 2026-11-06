/** Metadata and contents produced when a browser file is read for API upload. */
export interface DataUrlUpload {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** Reads one browser File into the data-URL upload shape used by the application. */
export function readFileAsDataUrl(file: File): Promise<DataUrlUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
