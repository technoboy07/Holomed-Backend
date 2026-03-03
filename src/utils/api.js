export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function parseErrorMessage(response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    return `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function apiRequest(
  apiBase,
  path,
  {
    method = "GET",
    token,
    headers = {},
    body,
    signal,
    responseType = "json",
  } = {}
) {
  const finalHeaders = { ...headers };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: finalHeaders,
    body,
    signal,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  if (responseType === "blob") return response.blob();
  if (responseType === "text") return response.text();
  if (responseType === "none") return null;
  return response.json();
}

export function isUnauthorizedError(error) {
  return error instanceof ApiError && error.status === 401;
}
