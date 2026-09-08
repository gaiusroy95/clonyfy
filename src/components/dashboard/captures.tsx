import { useState } from "react";
import { Download, ExternalLink, Eye, Link2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CloneJob, CloneStatus } from "./data";
import {
  ApiError,
  createShareLink,
  deleteOutput,
  downloadZipBlob,
  pagePreviewUrl,
} from "@/lib/api";

export const STATUS_LABELS: Record<CloneStatus, string> = {
  done: "Complete",
  running: "Running",
  queued: "Queued",
};

export function downloadCaptureReport(jobs: CloneJob[]) {
  const rows = [
    ["Domain", "Status", "Pages", "Assets", "API routes", "Elapsed", "Started"],
    ...jobs.map((job) => [
      job.domain,
      STATUS_LABELS[job.status],
      job.pages,
      job.assets,
      job.routes,
      job.elapsed,
      job.startedAt,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "clonyfy-captures.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CaptureStatus({ status }: { status: CloneStatus }) {
  return (
    <span className="capture-status" data-status={status}>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={status === "running" ? "capture-spinner" : ""}
      >
        {status === "done" ? (
          <path
            d="m3.5 8 3 3 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" opacity=".25" strokeWidth="1.5" />
            <path
              d={status === "running" ? "M8 2.5A5.5 5.5 0 0 1 13.5 8" : "M8 5v3l2 1"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CaptureDetails({
  job,
  onClose,
  onDeleted,
}: {
  job: CloneJob | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [busy, setBusy] = useState("");
  const canPreview = !!job?.outDir && job.status === "done";

  const openPreview = () => {
    if (!job?.outDir) {
      toast.error("Preview is available after the clone finishes.");
      return;
    }
    window.open(pagePreviewUrl(job.outDir), "_blank", "noopener,noreferrer");
  };

  const downloadZip = async () => {
    if (!job?.outDir) {
      toast.error("ZIP export is available after the clone finishes.");
      return;
    }
    setBusy("zip");
    try {
      const blob = await downloadZipBlob(job.outDir);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${job.domain || "clone"}.zip`;
      a.click();
      URL.revokeObjectURL(href);
      toast.success("ZIP downloaded.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ZIP export failed.");
    } finally {
      setBusy("");
    }
  };

  const share = async () => {
    if (!job?.outDir) {
      toast.error("Share is available after the clone finishes.");
      return;
    }
    setBusy("share");
    try {
      const data = await createShareLink(job.outDir);
      await navigator.clipboard.writeText(data.url);
      toast.success("Share link copied to clipboard.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create share link.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!job?.outDir) {
      toast.error("Nothing to delete yet.");
      return;
    }
    if (!window.confirm(`Delete clone for ${job.domain}?`)) return;
    setBusy("delete");
    try {
      await deleteOutput(job.outDir);
      toast.success("Clone deleted.");
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete clone.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog
      open={!!job}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="dashboard-dialog" data-lenis-prevent>
        {job && (
          <>
            <p className="eyebrow">Capture details</p>
            <DialogTitle className="break-all pr-4 font-display text-2xl leading-tight">
              {job.domain}
            </DialogTitle>
            <DialogDescription>
              Inspect the capture, open a live preview, or export the project ZIP.
            </DialogDescription>
            <CaptureStatus status={job.status} />
            <dl className="capture-detail-grid">
              {[
                ["Pages", job.pages],
                ["Assets", job.assets],
                ["API routes", job.routes],
                ["Elapsed", job.elapsed],
                ["Started", job.startedAt],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {canPreview ? (
              <div className="overflow-hidden rounded-2xl border border-border">
                <iframe
                  title={`Preview ${job.domain}`}
                  src={pagePreviewUrl(job.outDir!)}
                  className="h-[320px] w-full bg-background"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {job.status === "running"
                  ? "Clone is still running. Preview and export unlock when it finishes."
                  : "Preview and export will appear once this capture has an output folder."}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="dashboard-button" onClick={openPreview} disabled={!job.outDir}>
                <Eye size={16} />
                Open preview
              </button>
              <button
                type="button"
                className="dashboard-button bg-primary text-primary-foreground"
                onClick={() => void downloadZip()}
                disabled={!job.outDir || busy === "zip"}
              >
                <Download size={16} />
                {busy === "zip" ? "Preparing ZIP…" : "Download ZIP"}
              </button>
              <button
                type="button"
                className="dashboard-button"
                onClick={() => void share()}
                disabled={!job.outDir || busy === "share"}
              >
                <Link2 size={16} />
                {busy === "share" ? "Creating…" : "Copy share link"}
              </button>
              <a
                className="dashboard-button"
                href={`https://${job.domain}`}
                target="_blank"
                rel="noreferrer"
              >
                Visit source <ExternalLink size={16} />
              </a>
              <button type="button" className="dashboard-button" onClick={() => downloadCaptureReport([job])}>
                <Download size={16} />
                Download summary
              </button>
              <button
                type="button"
                className="dashboard-button"
                onClick={() => void remove()}
                disabled={!job.outDir || busy === "delete"}
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One table owns the columns, so every row shares exactly the same alignment. */
export function CaptureTable({
  jobs,
  caption = "Recent captures",
}: {
  jobs: CloneJob[];
  caption?: string;
}) {
  const [selected, setSelected] = useState<CloneJob | null>(null);
  return (
    <>
      <div
        className="capture-table-scroll"
        data-scroll-region
        data-lenis-prevent
        tabIndex={0}
        role="region"
        aria-label={`${caption}, scroll horizontally for all columns`}
      >
        <table className="capture-table">
          <caption className="sr-only">{caption}. Select a website to inspect its capture.</caption>
          <colgroup>
            <col />
            <col className="capture-number-col" />
            <col className="capture-number-col" />
            <col className="capture-time-col" />
            <col className="capture-status-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Website</th>
              <th scope="col">Pages</th>
              <th scope="col">Assets</th>
              <th scope="col">Time</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <th scope="row">
                  <button
                    onClick={() => setSelected(job)}
                    className="capture-domain"
                    title={job.domain}
                  >
                    {job.domain}
                  </button>
                </th>
                <td>{job.pages}</td>
                <td>{job.assets}</td>
                <td>{job.elapsed}</td>
                <td>
                  <CaptureStatus status={job.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="capture-mobile-list" aria-label={caption}>
        {jobs.map((job) => (
          <li key={job.id}>
            <button className="capture-mobile-domain" onClick={() => setSelected(job)}>
              {job.domain}
            </button>
            <CaptureStatus status={job.status} />
            <dl>
              {[
                ["Pages", job.pages],
                ["Assets", job.assets],
                ["Time", job.elapsed],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <CaptureDetails job={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export function CaptureSearch({
  value,
  onChange,
  label = "Search captures",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="dashboard-search">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
      />
    </label>
  );
}

export function EmptyCaptures({ onReset }: { onReset: () => void }) {
  return (
    <div className="capture-empty">
      <svg viewBox="0 0 160 96" fill="none" aria-hidden="true">
        <rect x="24" y="12" width="96" height="64" rx="8" stroke="currentColor" opacity=".35" />
        <path d="M24 30h96M40 44h44M40 56h28" stroke="currentColor" opacity=".4" />
        <circle cx="112" cy="65" r="17" fill="var(--card)" stroke="currentColor" />
        <path d="m125 78 12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h3>No matching captures</h3>
      <p>Try another website or clear your filters.</p>
      <button className="dashboard-button" onClick={onReset}>
        Clear filters
      </button>
    </div>
  );
}
