type ApiRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type ElectronApiResponse = {
  status: number;
  contentType: string;
  body: string;
};

type KeyboxElectronBridge = {
  apiRequest?: (
    url: string,
    options?: ApiRequestOptions,
  ) => Promise<ElectronApiResponse>;
};

/** Send desktop API calls through Electron so the session token stays in the main process. */
export async function apiFetch(
  url: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const bridge =
    typeof window === "undefined"
      ? undefined
      : (window as Window & { electron?: KeyboxElectronBridge }).electron;

  if (!bridge?.apiRequest) {
    // Next.js handles the API route; only Electron can add the per-launch token.
    return fetch(url, options);
  }

  const response = await bridge.apiRequest(url, options);
  return new Response(response.body, {
    status: response.status,
    headers: response.contentType
      ? { "Content-Type": response.contentType }
      : undefined,
  });
}
