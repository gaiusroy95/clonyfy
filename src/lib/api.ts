/** Browser-facing Backend API base (no trailing slash). */
export function getApiBaseUrl(): string {
  const raw = String(import.meta.env["VITE_API_BASE_URL"] || "").trim().replace(/\/$/, "");
  return raw || "http://localhost:5000";
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const TOKEN_KEY = "clonyfy_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
};

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, auth = true, timeoutMs = 60_000, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders || {});
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getAuthToken();
    if (token) headers.set("X-Auth-Token", token);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      ...rest,
      headers,
      signal: rest.signal || controller.signal,
      credentials: "omit",
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, init);
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const message =
        data && typeof data === "object" && data !== null && "error" in data
          ? String((data as { error: unknown }).error || `HTTP ${res.status}`)
          : `HTTP ${res.status}`;
      throw new ApiError(message, res.status, data);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export type PlanLimits = {
  clonesPerMonth: number | null;
  maxPages: number | null;
  fullSiteAllowed?: boolean;
  fullSiteMaxPages?: number | null;
  fullSiteDepth?: number | null;
  editsPerMonth?: number | null;
  savesPerMonth?: number | null;
  sharesPerMonth?: number | null;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  planLabel?: string;
  planLimits?: PlanLimits;
  planRenewsAt?: string | null;
  billingInterval?: string | null;
  emailVerified?: boolean;
  cancelAtPeriodEnd?: boolean;
  createdAt?: string;
};

export type UsageSummary = {
  periodStart?: string;
  editsThisMonth?: number;
  savesThisMonth?: number;
  sharesThisMonth?: number;
  clonesThisMonth?: number;
  limits?: PlanLimits;
  totalClones?: number;
  totalPages?: number;
  totalAssets?: number;
  limitThisMonth?: number | null;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  usage?: UsageSummary;
};

export async function loginRequest(email: string, password: string, remember = true) {
  return apiFetch<AuthSession>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password, remember },
    timeoutMs: 120_000,
  });
}

export async function registerRequest(name: string, email: string, password: string) {
  return apiFetch<AuthSession>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { name, email, password },
    timeoutMs: 120_000,
  });
}

export async function fetchMe() {
  return apiFetch<{ user: AuthUser; usage: UsageSummary }>("/api/auth/me");
}

export async function logoutRequest() {
  try {
    await apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  } catch {
    /* still clear local session */
  } finally {
    setAuthToken(null);
  }
}

export function googleAuthUrl() {
  return `${getApiBaseUrl()}/api/auth/google`;
}

export type CloneJobResponse = {
  id: string;
  url: string;
  hostname?: string;
  status: string;
  logs?: string[];
  outDir?: string;
  startedAt?: string;
  pages?: number | null;
  apiRoutes?: number | null;
  assets?: number | null;
  maxPages?: number;
  depth?: number;
  ignoreRobots?: boolean;
  fullSite?: boolean;
};

export type OutputItem = {
  id?: string;
  name?: string;
  dir: string;
  targetOrigin?: string;
  capturedAt?: string;
  status?: string;
  pages?: number;
  assets?: number;
  apiRoutes?: number;
  label?: string | null;
};

export async function startClone(input: {
  url: string;
  maxPages: number;
  depth: number;
  ignoreRobots?: boolean;
}) {
  return apiFetch<CloneJobResponse>("/api/clone", {
    method: "POST",
    body: {
      url: input.url,
      maxPages: input.maxPages,
      depth: input.depth,
      ignoreRobots: !!input.ignoreRobots,
    },
    timeoutMs: 120_000,
  });
}

export async function fetchJobStatus(id: string, logsFrom = 0) {
  return apiFetch<CloneJobResponse>(
    `/api/status?id=${encodeURIComponent(id)}&logsFrom=${logsFrom}`,
    { timeoutMs: 30_000 },
  );
}

export async function fetchOutputs(limit = 50) {
  return apiFetch<OutputItem[]>(`/api/outputs?limit=${limit}`);
}

export async function fetchDashboard() {
  return apiFetch<{
    user: AuthUser;
    usage: UsageSummary;
    recentClones: Array<{
      id: string;
      url: string;
      status: string;
      pages?: number;
      startedAt?: string;
    }>;
  }>("/api/user/dashboard");
}

export async function updateProfile(body: { name?: string; password?: string }) {
  return apiFetch<{ ok: boolean }>("/api/user/profile", { method: "PUT", body });
}

export async function fetchPlans() {
  return apiFetch<{
    plans: Record<string, { monthly: number; annual: number }>;
    limits: Record<string, PlanLimits>;
    labels: Record<string, string>;
  }>("/api/payments/plans", { auth: false });
}

export async function fetchBillingHistory() {
  return apiFetch<{ payments: Array<Record<string, unknown>> }>("/api/user/billing");
}

export async function startStripeCheckout(plan: string, interval: "monthly" | "yearly" = "monthly") {
  return apiFetch<{ url: string }>("/api/payments/stripe/checkout", {
    method: "POST",
    body: { plan, interval },
  });
}

export async function openStripePortal() {
  return apiFetch<{ url: string }>("/api/payments/stripe/portal", { method: "POST" });
}

export async function cancelSubscription() {
  return apiFetch<{ ok: boolean }>("/api/user/cancel-subscription", { method: "POST" });
}

export async function previewClone(outDir: string) {
  return apiFetch<{ ok: boolean; url: string; hosted?: boolean }>("/api/preview", {
    method: "POST",
    body: { outDir },
  });
}

export function pagePreviewUrl(outDir: string, route = "/") {
  const token = getAuthToken();
  const params = new URLSearchParams({
    outDir,
    route,
  });
  if (token) params.set("access_token", token);
  return `${getApiBaseUrl()}/api/page?${params.toString()}`;
}

export async function createShareLink(outDir: string, route = "/") {
  return apiFetch<{ shareId: string; url: string }>("/api/share/create", {
    method: "POST",
    body: { outDir, route },
  });
}

export async function deleteOutput(outDir: string) {
  return apiFetch<{ ok: boolean }>("/api/output", {
    method: "DELETE",
    body: { outDir },
  });
}

export function downloadZipUrl(outDir: string) {
  const params = new URLSearchParams({ outDir });
  return `${getApiBaseUrl()}/api/download-zip?${params.toString()}`;
}

export async function forgotPasswordRequest(email: string) {
  return apiFetch<{ ok: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function resetPasswordRequest(token: string, password: string) {
  return apiFetch<{ ok: boolean }>("/api/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, password },
  });
}

export async function connectGitHub(token: string) {
  return apiFetch<{
    ok: boolean;
    user: { login: string; name: string; avatarUrl?: string };
    repos: Array<{
      fullName: string;
      defaultBranch: string;
      private: boolean;
      htmlUrl: string;
      pushedAt?: string;
    }>;
  }>("/api/github/connect", {
    method: "POST",
    body: { token },
  });
}

export async function pushToGitHub(input: {
  outDir: string;
  token: string;
  repo: string;
  branch?: string;
  commitMessage?: string;
}) {
  return apiFetch<{ ok: boolean; url?: string }>("/api/github/push", {
    method: "POST",
    body: input,
    timeoutMs: 180_000,
  });
}

export async function downloadZipBlob(outDir: string): Promise<Blob> {
  const token = getAuthToken();
  const res = await fetch(downloadZipUrl(outDir), {
    headers: token ? { "X-Auth-Token": token } : {},
  });
  const contentType = String(res.headers.get("content-type") || "");
  if (contentType.includes("application/json")) {
    const data = (await res.json()) as {
      error?: string;
      downloadUrl?: string;
      mode?: string;
      parts?: Array<{ url: string; index: number }>;
    };
    if (!res.ok || data.error) throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
    if (data.mode === "parts" && Array.isArray(data.parts)) {
      const ordered = data.parts.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
      const chunks: ArrayBuffer[] = [];
      for (const part of ordered) {
        const partRes = await fetch(part.url);
        if (!partRes.ok) throw new ApiError(`Could not download part ${part.index + 1}`, partRes.status);
        chunks.push(await partRes.arrayBuffer());
      }
      return new Blob(chunks, { type: "application/zip" });
    }
    if (data.downloadUrl) {
      const zipRes = await fetch(data.downloadUrl);
      if (!zipRes.ok) throw new ApiError("Could not download export", zipRes.status);
      return zipRes.blob();
    }
    throw new ApiError("Export did not return a download URL", 500, data);
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return res.blob();
}
