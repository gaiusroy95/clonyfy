import { useEffect, useState } from "react";
import { ExternalLink, Figma, Monitor, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  ApiError,
  copyFigmaSceneToClipboard,
  downloadFigmaSvgBlob,
  downloadFigmaZipBlob,
  fetchClonePages,
  fetchFigmaScene,
  fetchPublicConfig,
  triggerBrowserDownload,
} from "@/lib/api";

/**
 * Original Clonyfy Figma export modal:
 * - Desktop: Scene Graph → clipboard → Clonyfy Import plugin
 * - Web: Download SVG → drag onto Figma canvas
 */
export function ExportFigmaDialog({
  open,
  onOpenChange,
  outDir,
  initialRoute = "/",
  domain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outDir: string;
  initialRoute?: string;
  domain?: string;
}) {
  const [routes, setRoutes] = useState<string[]>([initialRoute || "/"]);
  const [route, setRoute] = useState(initialRoute || "/");
  const [pluginUrl, setPluginUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [pages, cfg] = await Promise.all([
          fetchClonePages(outDir).catch(() => [] as string[]),
          fetchPublicConfig().catch(() => ({ figma_community_plugin_url: "" })),
        ]);
        if (cancelled) return;
        const list = pages.length ? pages : ["/"];
        setRoutes(list);
        setRoute(list.includes(initialRoute) ? initialRoute : list[0] || "/");
        setPluginUrl(String(cfg.figma_community_plugin_url || "").trim());
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, outDir, initialRoute]);

  const paidGate = (err: unknown) => {
    if (err instanceof ApiError && err.status === 403) {
      return err.message || "Figma export requires a paid plan. Upgrade in Subscription.";
    }
    return err instanceof ApiError ? err.message : "Figma export failed.";
  };

  const exportDesktop = async () => {
    setBusy("desktop");
    setHint("");
    try {
      const { scene, warning } = await fetchFigmaScene(outDir, route);
      try {
        await copyFigmaSceneToClipboard(scene);
        setHint(
          "Scene Graph copied. In Figma Desktop: Plugins → Clonyfy Import (or Run last plugin).",
        );
        toast.success("Copied for Figma Desktop. Open Clonyfy Import in Figma.");
        if (warning) toast.message(warning);
      } catch {
        // Clipboard may be blocked — fall back to downloading JSON the plugin can paste.
        const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
        triggerBrowserDownload(
          blob,
          `${(domain || "clone").replace(/[^\w.-]+/g, "_")}-figma-scene.json`,
        );
        setHint(
          "Clipboard was blocked. JSON downloaded — paste it into Clonyfy Import in Figma.",
        );
        toast.message("Clipboard blocked — scene JSON downloaded instead.");
      }
    } catch (err) {
      toast.error(paidGate(err));
    } finally {
      setBusy("");
    }
  };

  const exportSvgWeb = async () => {
    setBusy("svg");
    setHint("");
    try {
      const { blob, filename } = await downloadFigmaSvgBlob(outDir, route);
      triggerBrowserDownload(blob, filename);
      setHint("SVG downloaded. In Figma Web or Desktop, drag the file onto the canvas.");
      toast.success("SVG ready for Figma Web.");
    } catch (err) {
      toast.error(paidGate(err));
    } finally {
      setBusy("");
    }
  };

  const exportZipAll = async () => {
    setBusy("zip");
    setHint("");
    try {
      const { blob, filename } = await downloadFigmaZipBlob(outDir);
      triggerBrowserDownload(blob, filename);
      setHint("Multi-page Figma ZIP downloaded (SVG per route).");
      toast.success("Figma ZIP downloaded.");
    } catch (err) {
      toast.error(paidGate(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dashboard-dialog max-w-lg" data-lenis-prevent>
        <DialogTitle className="flex items-center gap-2">
          <Figma size={18} />
          Export to Figma
        </DialogTitle>
        <DialogDescription>
          Same flow as the original Clonyfy product: editable layers via the Desktop plugin, or SVG
          for Figma Web.
        </DialogDescription>

        <label className="mt-4 block text-sm">
          Page route
          <select
            className="mt-2 w-full rounded-xl border border-border bg-background p-3"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            disabled={!!busy}
          >
            {routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            className="dashboard-button w-full justify-start bg-primary text-primary-foreground"
            disabled={!!busy}
            onClick={() => void exportDesktop()}
          >
            <Monitor size={16} />
            {busy === "desktop" ? "Building scene…" : "Export for Figma Desktop"}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Copies Scene Graph JSON to the clipboard. Then open{" "}
            <strong>Plugins → Clonyfy Import</strong> in Figma Desktop (auto-imports from clipboard).
          </p>

          <button
            type="button"
            className="dashboard-button w-full justify-start"
            disabled={!!busy}
            onClick={() => void exportSvgWeb()}
          >
            <Globe2 size={16} />
            {busy === "svg" ? "Exporting SVG…" : "Download SVG for Figma Web"}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Download an SVG and drag it onto the Figma canvas (works in Figma Web without the
            plugin).
          </p>

          <button
            type="button"
            className="dashboard-button w-full justify-start"
            disabled={!!busy}
            onClick={() => void exportZipAll()}
          >
            <Figma size={16} />
            {busy === "zip" ? "Preparing ZIP…" : "Download Figma ZIP (all pages)"}
          </button>
        </div>

        {pluginUrl ? (
          <a
            className="dashboard-button mt-4 inline-flex w-full justify-center"
            href={pluginUrl}
            target="_blank"
            rel="noreferrer"
          >
            Install Clonyfy Import
            <ExternalLink size={16} />
          </a>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Plugin install link appears here when{" "}
            <code className="text-[11px]">FIGMA_COMMUNITY_PLUGIN_URL</code> is set on the Backend.
            Until then, import the Development plugin from{" "}
            <code className="text-[11px]">Backend/figma-plugin</code>.
          </p>
        )}

        {hint && (
          <p className="mt-4 rounded-xl border border-border bg-background p-3 text-xs leading-relaxed" role="status">
            {hint}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
