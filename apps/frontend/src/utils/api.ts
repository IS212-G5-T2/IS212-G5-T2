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
    response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080"}/api${path}`,
      {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status >= 500
        ? "The service is temporarily unavailable. Please try again."
        : (data.message ?? "Request failed."),
      data.errors,
    );
  return data as T;
}
