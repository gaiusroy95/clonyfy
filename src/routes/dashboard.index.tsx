import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Download,
  Globe,
  Monitor,
  Play,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { CapturePipeline } from "@/components/dashboard/pipeline";
import {
  ScanningBrowser,
  buildDemoHtml,
  downloadDemoFile,
  escapeHtml,
} from "@/components/dashboard/demo-preview";
import { useDashboardWorkspace } from "@/components/dashboard/workspace";
import type { CloneJob } from "@/components/dashboard/data";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pagePreviewUrl } from "@/lib/api";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Clone a website — Clonyfy dashboard" },
      {
        name: "description",
        content: "Try the Clonyfy workflow from website capture to editable preview and export.",
      },
    ],
  }),
  component: ClonePage,
});

const STAGES = [
  { title: "Connect to source", detail: "Resolve the URL and prepare a browser session.", at: 0 },
  {
    title: "Explore every page",
    detail: "Scroll through sections and discover linked pages.",
    at: 12,
  },
  {
    title: "Collect the assets",
    detail: "Gather images, type, styles and responsive details.",
    at: 40,
  },
  {
    title: "Build the starting point",
    detail: "Organize the sample into editable components.",
    at: 64,
  },
  {
    title: "Prepare your workspace",
    detail: "Assemble the preview and prepare the sample exports.",
    at: 84,
  },
];
type Run = {
  id: string;
  domain: string;
  pages: number;
  depth: number;
  respectRobots: boolean;
  outDir?: string;
  assets?: number;
  routes?: number;
  startedAt?: string;
};

function ClonePage() {
  const { addJob, refreshJobs } = useDashboardWorkspace();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(20);
  const [depth, setDepth] = useState(3);
  const [respectRobots, setRespectRobots] = useState(true);
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [headline, setHeadline] = useState("A better place to begin.");
  const [accent, setAccent] = useState("#d8c6a3");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [guide, setGuide] = useState(false);
  const busy = phase === "running" || phase === "paused";
  const stage = STAGES.reduce((active, item, index) => (progress >= item.at ? index : active), 0);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("clonyfy_pending_clone_url");
      if (pending) {
        setUrl(pending);
        sessionStorage.removeItem("clonyfy_pending_clone_url");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (phase !== "running" || !run?.id) return;
    const jobId = run.id;
    const targetPages = Math.max(1, run.pages || maxPages);
    let cancelled = false;
    let logsFrom = 0;
    const poll = async () => {
      try {
        const { fetchJobStatus } = await import("@/lib/api");
        const job = await fetchJobStatus(jobId, logsFrom);
        if (cancelled) return;
        logsFrom = Array.isArray(job.logs) ? job.logs.length : logsFrom;
        const pages = Number(job.pages) || 0;
        const pct =
          job.status === "done" || job.status === "error"
            ? 100
            : Math.min(95, Math.round((pages / targetPages) * 90) + 5);
        setProgress(pct);
        setRun((current) => {
          if (!current || current.id !== jobId) return current;
          const next: Run = {
            ...current,
            pages: pages || current.pages,
            assets: Number(job.assets) || current.assets || 0,
            routes: Number(job.apiRoutes) || current.routes || 0,
          };
          if (job.outDir) next.outDir = job.outDir;
          if (job.startedAt) next.startedAt = job.startedAt;
          return next;
        });
        if (job.status === "done") {
          const doneJob: CloneJob = {
            id: jobId,
            domain: job.hostname || run.domain,
            pages: pages || run.pages,
            assets: Number(job.assets) || 0,
            routes: Number(job.apiRoutes) || 0,
            elapsed: "—",
            startedAt: job.startedAt
              ? new Date(job.startedAt).toLocaleTimeString("en-US")
              : new Date().toLocaleTimeString("en-US"),
            status: "done",
          };
          if (job.outDir) doneJob.outDir = job.outDir;
          addJob(doneJob);
          void refreshJobs();
          setPhase("done");
          setProgress(100);
          setNotice("Capture complete. Your clone is now in Library and Activity.");
          return;
        }
        if (job.status === "error") {
          setPhase("idle");
          setProgress(0);
          setError("Clone failed. Check the URL and try again.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not read clone status.");
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, run?.id, run?.domain, run?.pages, maxPages, addJob, refreshJobs]);

  async function start(source = url) {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(source.trim()) ? source.trim() : `https://${source.trim()}`,
      );
      if (
        !["https:", "http:"].includes(parsed.protocol) ||
        !parsed.hostname.includes(".") ||
        parsed.username ||
        parsed.password ||
        !/^[a-z0-9.-]+$/i.test(parsed.hostname)
      )
        throw new Error("url");
      if (
        !Number.isInteger(maxPages) ||
        maxPages < 1 ||
        maxPages > 60 ||
        !Number.isInteger(depth) ||
        depth < 1 ||
        depth > 5
      ) {
        setError("Choose 1–60 pages and a crawl depth of 1–5.");
        return;
      }
      setUrl(parsed.href);
      const { startClone } = await import("@/lib/api");
      const job = await startClone({
        url: parsed.href,
        maxPages,
        depth,
        ignoreRobots: !respectRobots,
      });
      setRun({
        id: job.id,
        domain: job.hostname || parsed.host,
        pages: job.maxPages || maxPages,
        depth,
        respectRobots,
        ...(job.outDir ? { outDir: job.outDir } : {}),
        ...(job.startedAt ? { startedAt: job.startedAt } : {}),
        assets: 0,
        routes: 0,
      });
      setProgress(2);
      setPhase("running");
      setHeadline("A better place to begin.");
      const runningJob: CloneJob = {
        id: job.id,
        domain: job.hostname || parsed.host,
        pages: 0,
        assets: 0,
        routes: 0,
        elapsed: "0s",
        startedAt: new Date().toLocaleTimeString("en-US"),
        status: "running",
      };
      if (job.outDir) runningJob.outDir = job.outDir;
      addJob(runningJob);
    } catch (err) {
      if (err instanceof Error && err.message === "url") {
        setError("Enter a website address such as https://example.com.");
        return;
      }
      const { ApiError } = await import("@/lib/api");
      setError(err instanceof ApiError ? err.message : "Could not start clone. Please try again.");
    }
  }

  const html = buildDemoHtml(headline, accent, run?.domain ?? "example.com");
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Clipboard is unavailable here. Use Download HTML to keep the sample.");
    }
  };
  const exportReact = () => {
    const code = `// Clonyfy demo concept, not a capture of the source website.\nexport default function ClonyfyConcept() {\n  return <iframe title="Clonyfy concept" style={{width: "100%", height: "100vh", border: 0}} sandbox="" srcDoc={${JSON.stringify(html)}} />;\n}\n`;
    downloadDemoFile("ClonyfyConcept.jsx", code, "text/javascript");
    setNotice(
      "React sample downloaded. It embeds the editable HTML concept in an isolated preview.",
    );
  };
  const exportSvg = () => {
    const lines = headline.match(/.{1,24}(?:\s|$)|.{1,24}/g)?.slice(0, 3) ?? [headline];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000"><rect width="1440" height="1000" fill="#101113"/><text x="80" y="80" fill="#f2efe9" font-family="sans-serif" font-size="24">${escapeHtml(run?.domain ?? "Clonyfy")}</text>${lines.map((line, i) => `<text x="80" y="${240 + i * 88}" fill="#f2efe9" font-family="sans-serif" font-size="80">${escapeHtml(line)}</text>`).join("")}<rect x="80" y="520" width="220" height="60" rx="30" fill="${accent}"/><text x="108" y="557" fill="#17181b" font-family="sans-serif" font-size="20">Explore possibilities</text>${[0, 1, 2].map((i) => `<rect x="${80 + i * 440}" y="660" width="400" height="220" rx="24" fill="#191b1f" stroke="#a3a7b0"/><text x="${112 + i * 440}" y="720" fill="#f2efe9" font-family="sans-serif" font-size="28">0${i + 1} · Your next step</text>`).join("")}<text x="80" y="956" fill="#b8bbc2" font-family="sans-serif" font-size="18">Clonyfy demo concept · editable SVG for Figma</text></svg>`;
    downloadDemoFile("clonyfy-figma-concept.svg", svg, "image/svg+xml");
    setNotice("Editable SVG downloaded. Drag it into Figma to explore the sample design.");
  };
  const exportZip = async () => {
    if (!run?.outDir) {
      setNotice("ZIP export will be available once the clone finishes saving.");
      return;
    }
    try {
      const { downloadZipBlob } = await import("@/lib/api");
      const blob = await downloadZipBlob(run.outDir);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${run.domain || "clone"}.zip`;
      a.click();
      URL.revokeObjectURL(href);
      setNotice("ZIP downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP export failed.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="eyebrow">From inspiration to your next build</p>
        <h1 className="display-lg mt-3">Clone a website.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Enter a URL to crawl the live site, capture pages and assets, then preview and export the
          result.
        </p>
      </header>
      <form
        className="surface rounded-3xl p-5 md:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
        noValidate
      >
        <label htmlFor="clone-url" className="eyebrow">
          Website URL
        </label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="dashboard-search">
            <Globe size={16} className="shrink-0" />
            <input
              id="clone-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
              placeholder="https://example.com"
              autoComplete="url"
              aria-describedby={error ? "clone-error" : "clone-hint"}
              aria-invalid={!!error}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="dashboard-button bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Play size={16} />
            {busy ? "Cloning…" : "Start clone"}
          </button>
        </div>
        <p id="clone-hint" className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Clones run on the Backend. Progress updates live while pages and assets are captured.
        </p>
        <fieldset
          disabled={busy}
          className="mt-6 flex flex-wrap items-center gap-6 disabled:opacity-60"
        >
          <legend className="sr-only">Capture settings</legend>
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            Max pages
            <input
              aria-label="Max pages"
              type="number"
              min={1}
              max={60}
              value={maxPages}
              onChange={(event) => setMaxPages(Number(event.target.value))}
              className="w-20 rounded-xl border border-border bg-transparent p-3 text-foreground"
            />
          </label>
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            Depth
            <input
              aria-label="Depth"
              type="number"
              min={1}
              max={5}
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value))}
              className="w-20 rounded-xl border border-border bg-transparent p-3 text-foreground"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={respectRobots}
              onChange={(event) => setRespectRobots(event.target.checked)}
              className="h-4 w-4 accent-white"
            />
            Respect robots.txt
          </label>
        </fieldset>
        {error && (
          <p id="clone-error" role="alert" className="mt-4 text-sm">
            {error}
          </p>
        )}
        {!busy && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs text-muted-foreground">Try a sample</span>
            {["stripe.com", "notion.com", "linear.app"].map((domain) => (
              <button
                type="button"
                key={domain}
                className="dashboard-button text-xs"
                onClick={() => start(`https://${domain}`)}
              >
                {domain} ↗
              </button>
            ))}
          </div>
        )}
      </form>

      {phase === "idle" && <CapturePipeline />}
      {run && phase !== "idle" && (
        <section className="space-y-6" aria-label="Cloning progress">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">
                {phase === "done" ? "Ready to make yours" : "Cloning in progress"}
              </p>
              <h2 className="mt-2 break-all font-display text-2xl">{run.domain}</h2>
            </div>
            <div className="flex gap-2">
              {busy ? (
                <button
                  className="dashboard-button"
                  onClick={() => {
                    setPhase("idle");
                    setProgress(0);
                    setNotice("Stopped watching this job. The Backend clone may still finish.");
                  }}
                >
                  Stop watching
                </button>
              ) : (
                <button className="dashboard-button" onClick={() => start()}>
                  <RotateCcw size={16} />
                  Run again
                </button>
              )}
            </div>
          </div>
          <div className="demo-process-grid">
            <ScanningBrowser domain={run.domain} running={phase === "running"} />
            <div className="surface rounded-3xl p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h3 className="text-sm">
                  {phase === "paused"
                    ? "Paused"
                    : phase === "done"
                      ? "Capture complete"
                      : "Building your starting point"}
                </h3>
                <span className="text-sm tabular-nums">{progress}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Clone progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1 overflow-hidden rounded-full bg-accent"
              >
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <ol className="mt-6 space-y-5">
                {STAGES.map((item, i) => (
                  <li
                    key={item.title}
                    className="flex gap-3"
                    aria-current={stage === i && busy ? "step" : undefined}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-xs ${i < stage || phase === "done" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {i < stage || phase === "done" ? <Check size={14} /> : `0${i + 1}`}
                    </span>
                    <div>
                      <p className={`text-sm ${stage < i ? "text-muted-foreground" : ""}`}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="sr-only" role="status">
                {phase === "done"
                  ? "Capture complete"
                  : phase === "paused"
                    ? "Capture paused"
                    : STAGES[stage]?.title}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["Pages captured", run.pages || 0],
              ["Assets collected", run.assets || 0],
              ["API routes", run.routes || 0],
              ["Robots preference", run.respectRobots ? "Respect" : "Ignore"],
            ].map(([label, value]) => (
              <div key={label} className="surface rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-lg tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === "done" && (
        <section className="surface rounded-3xl p-5 md:p-8" aria-label="Sample editor and exports">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Your creative workspace</p>
              <h2 className="mt-2 font-display text-2xl">Make the starting point yours.</h2>
            </div>
            <Link to="/dashboard/library" className="dashboard-button">
              Open library ↗
            </Link>
          </div>
          <div className="demo-editor-grid">
            <div className="space-y-6">
              <label className="block text-sm">
                Headline
                <input
                  value={headline}
                  maxLength={100}
                  onChange={(event) => setHeadline(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3"
                />
              </label>
              <fieldset>
                <legend className="text-sm">Accent tone</legend>
                <div className="mt-3 flex gap-2">
                  {(
                    [
                      ["Champagne", "#d8c6a3"],
                      ["Porcelain", "#e7e7e7"],
                      ["Stone", "#b9b5ac"],
                    ] as const
                  ).map(([name, color]) => (
                    <button
                      key={name}
                      aria-label={name}
                      aria-pressed={accent === color}
                      className="grid h-11 w-11 place-items-center rounded-full border border-border"
                      style={{ background: color, color: "#17181b" }}
                      onClick={() => setAccent(color)}
                    >
                      {accent === color && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div role="group" aria-label="Preview viewport" className="flex flex-wrap gap-2">
                {(["desktop", "mobile"] as const).map((mode) => (
                  <button
                    key={mode}
                    className="dashboard-button"
                    aria-pressed={viewport === mode}
                    onClick={() => setViewport(mode)}
                  >
                    {mode === "desktop" ? <Monitor size={16} /> : <Smartphone size={16} />}
                    {mode}
                  </button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Live preview of the captured homepage. Use Download ZIP for the full Next.js export.
              </p>
            </div>
            <div className="demo-editor-canvas" data-viewport={viewport}>
              {run?.outDir ? (
                <iframe
                  title="Clone preview"
                  src={pagePreviewUrl(run.outDir)}
                  className="h-[520px] w-full rounded-2xl border border-border bg-background"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <iframe
                  title="Editable sample preview"
                  srcDoc={html}
                  sandbox=""
                  className="h-[520px] w-full rounded-2xl border border-border"
                />
              )}
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-base">Take it into your workflow.</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="dashboard-button bg-primary text-primary-foreground"
                onClick={() => void exportZip()}
                disabled={!run?.outDir}
              >
                <Download size={16} />
                Download ZIP
              </button>
              <button
                className="dashboard-button"
                onClick={() => {
                  downloadDemoFile("clonyfy-concept.html", html, "text/html");
                  setNotice("Concept HTML downloaded (local editor sample).");
                }}
              >
                <Download size={16} />
                Download HTML concept
              </button>
              <button className="dashboard-button" onClick={exportReact}>
                React sample
              </button>
              <button className="dashboard-button" onClick={exportSvg}>
                Figma SVG
              </button>
              <button className="dashboard-button" onClick={() => setGuide(true)}>
                GitHub & deploy
              </button>
              <button className="dashboard-button" onClick={() => void copy(html)}>
                <Copy size={16} />
                Copy HTML
              </button>
            </div>
          </div>
        </section>
      )}
      <p className="text-sm text-muted-foreground" role="status">
        {notice}
      </p>
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="dashboard-dialog" data-lenis-prevent>
          <DialogTitle>Export and deploy</DialogTitle>
          <DialogDescription>
            Download the full ZIP export, then push it to your own repository or static host.
          </DialogDescription>
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed">
            <li>Download ZIP for the complete generated Next.js project.</li>
            <li>Add the files to your own repository and commit with your GitHub account.</li>
            <li>Deploy with your preferred host (Vercel, Netlify, Render, etc.).</li>
          </ol>
          <button
            className="dashboard-button"
            onClick={() => {
              if (run?.outDir) {
                void exportZip();
                return;
              }
              downloadDemoFile("index.html", html, "text/html");
              setNotice("Deployment sample downloaded as index.html.");
            }}
          >
            Download deployment package
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
