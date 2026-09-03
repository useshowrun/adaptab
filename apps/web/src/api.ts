export async function postJson<T>(path: string, input: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });

  const body = await response.json().catch(() => ({
    error: "invalid_response",
    message: "AdapTab returned a non-JSON response.",
  }));

  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : `AdapTab request failed with HTTP ${response.status}.`,
    );
  }

  return body as T;
}
