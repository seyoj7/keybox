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
  apiRequest?: (url: string, options?: ApiRequestOptions) => Promise<ElectronApiResponse>;
};

/** Send packaged-app API calls through Electron's main process. */
export async function apiFetch(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  const bridge = typeof window === "undefined"
    ? undefined
    : (window as Window & { electron?: KeyboxElectronBridge }).electron;

  if (!bridge?.apiRequest) {
    // The development backend is loopback-only and may be run without Electron.
    return fetch(url, options);
  }

  const response = await bridge.apiRequest(url, options);
  return new Response(response.body, {
    status: response.status,
    headers: response.contentType ? { "Content-Type": response.contentType } : undefined,
  });
}
