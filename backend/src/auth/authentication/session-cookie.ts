/** Read the configured session value from an HTTP Cookie header. */
export function readSessionCookie(
  header: string | undefined,
  cookieName: string,
): string | undefined {
  if (!header) return undefined;

  return header
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
