export class ApiError extends Error {
  constructor(
    message: string,
    public errors?: Record<string, string>,
    /** Machine-readable server error code, such as registration_closed. */
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}
/** Backend origin shared by api() and the SPM-63 file download. */
export const apiBaseUrl = (): string => import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = Object.fromEntries(
      new Headers(init?.headers).entries(),
    ) as Record<string, string>;

    headers["Content-Type"] = "application/json";

    response = await fetch(
      `${apiBaseUrl()}/api${path}`,
      {
        ...init,
        credentials: "include",
        headers,
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
    );
  }
  let data: { message?: string; errors?: Record<string, string>; code?: string } = {};
  try {
    data = await response.json();
  } catch {
    // Non-JSON error bodies (e.g. a 413 from the body-size limit) fall through
    // to the status-based messages below.
  }
  if (!response.ok)
    throw new ApiError(
      response.status === 413
        ? "The files you attached are too large. Please attach smaller files and try again."
        : response.status >= 500
          ? "The service is temporarily unavailable. Please try again."
          : (data.message ?? "Request failed."),
      data.errors,
      data.code,
      response.status,
    );
  return data as T;
}
