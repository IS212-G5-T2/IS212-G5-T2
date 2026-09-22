export class ApiError extends Error {
  constructor(
    message: string,
    public errors?: Record<string, string>,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = Object.fromEntries(
      new Headers(init?.headers).entries(),
    ) as Record<string, string>;

    headers["Content-Type"] = "application/json";

    response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080"}/api${path}`,
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
  let data: { message?: string; errors?: Record<string, string> } = {};
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
    );
  return data as T;
}
