export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function parseJsonBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "json_required", "Use an application/json request body.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new HttpError(413, "body_too_large", "Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, "body_too_large", "Request body is too large.");
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be a JSON object.");
  }
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function handleError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
  console.error(error);
  return json({ error: "internal_error", message: "AdapTab could not complete the request." }, 500);
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max: number; optional?: boolean } = { max: 200 },
): string | undefined {
  const value = body[key];
  if (value === undefined && options.optional) return undefined;
  if (typeof value !== "string") throw new HttpError(400, "invalid_input", `${key} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length < (options.min ?? 0) || trimmed.length > options.max) {
    throw new HttpError(400, "invalid_input", `${key} has an invalid length.`);
  }
  return trimmed;
}

export function assertKeys(body: Record<string, unknown>, allowed: string[]) {
  const extras = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extras.length) throw new HttpError(400, "invalid_input", `Unknown fields: ${extras.join(", ")}.`);
}
