"use client"

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Minus, Moon, Plus, Sun, X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const TX = "transition-[color,background-color,border-color,opacity] duration-150 ease-in-out";

// A "tap" = pointerdown → pointerup on the primary pointer with minimal
// movement and short duration. Anything beyond these thresholds is assumed
// to be a scroll/drag and is ignored. Values are deliberately tight enough
// that slow scrolls on touch devices won't register as taps.
const TAP_MAX_MOVE = 10; // px
const TAP_MAX_MS = 300;

// Renders a .docx file client-side with mammoth. Mammoth is dynamically
// imported so it only hits the bundle when someone actually opens a docx.
function DocxViewer({
  url,
  chromeVisible,
  onTap,
}: {
  url: string;
  chromeVisible: boolean;
  onTap: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [widthFit, setWidthFit] = useState(1);
  const [heightFit, setHeightFit] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [darkMode, setDarkMode] = useState(false);

  // Tracks the current potential-tap pointer. Reset whenever we commit to
  // "this is not a tap" (scroll/drag detected, pointer cancelled, tap fired).
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const GUTTER_X = 48;
  const GUTTER_Y = 32;
  const ZOOM_STEP = 0.1;

  const minScale = Math.min(heightFit, widthFit);
  const maxScale = widthFit;
  const scale = minScale + (maxScale - minScale) * zoom;

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setErr(null);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status})`);
        const buf = await res.arrayBuffer();
        const { default: mammoth } = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (cancelled) return;
        setHtml(result.value || "<p><em>This document appears to be empty.</em></p>");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to render file");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (html === null) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    const update = () => {
      const naturalW = contentEl.scrollWidth;
      const naturalH = contentEl.scrollHeight;
      if (naturalW === 0 || naturalH === 0) return;

      const availW = scrollEl.clientWidth - GUTTER_X;
      const availH = scrollEl.clientHeight - GUTTER_Y;
      const wFit = availW / naturalW;
      const hFit = Math.min(availH / naturalH, wFit);
      setWidthFit(wFit);
      setHeightFit(hFit);
      setNaturalSize({ w: naturalW, h: naturalH });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [html]);

  if (err) {
    return (
      <div className="h-full w-full flex items-center justify-center px-6">
        <p className="text-muted text-sm text-center">Could not render file: {err}</p>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-raised border-t-ink rounded-full animate-spin" />
      </div>
    );
  }
  const clampZoom = (z: number) => Math.min(1, Math.max(0, Math.round(z * 100) / 100));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) { tapStart.current = null; return; }
    // Skip taps that originate from the floating control bar — those are
    // button/slider interactions, not "show me the chrome" gestures.
    if ((e.target as HTMLElement).closest("[data-no-tap]")) {
      tapStart.current = null;
      return;
    }
    tapStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    const dt = Date.now() - start.t;
    if (dx < TAP_MAX_MOVE && dy < TAP_MAX_MOVE && dt < TAP_MAX_MS) {
      onTap();
    }
  };
  const handlePointerCancel = () => { tapStart.current = null; };

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        className={`h-full w-full overflow-auto ${darkMode ? "bg-ground" : "bg-white"}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          style={{
            width: naturalSize.w * scale,
            height: naturalSize.h * scale,
            margin: "0 auto",
            position: "relative",
          }}
        >
          <div
            ref={contentRef}
            className={`docx-rendered ${darkMode ? "docx-rendered-dark" : ""}`}
            style={{
              width: "max-content",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <div
        data-no-tap
        className={`absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-surface shadow-[0_12px_32px_rgba(0,0,0,0.5)] px-1.5 py-1 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button
          type="button"
          onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= 0.001}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent ${TX}`}
          aria-label="Decrease font size"
        >
          <Minus size={14} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={ZOOM_STEP}
          value={zoom}
          onChange={e => setZoom(clampZoom(Number(e.target.value)))}
          className="w-24 accent-[var(--muted)] cursor-pointer"
          aria-label="Font size"
        />
        <button
          type="button"
          onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= 0.999}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent ${TX}`}
          aria-label="Increase font size"
        >
          <Plus size={14} />
        </button>
        <div className="w-px h-4 bg-raised mx-1" />
        <button
          type="button"
          onClick={() => setDarkMode(d => !d)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised ${TX}`}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkMode ? "Light mode" : "Dark mode"}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function ViewPage() {
  const params = useParams<{ kind: string; songId: string }>();
  const searchParams = useSearchParams();

  const rawKind = params?.kind ?? "";
  const songId = params?.songId ?? "";
  const songName = searchParams?.get("song") ?? "";
  const kindIsValid = rawKind === "chords" || rawKind === "lyrics";
  const label = rawKind === "chords" ? "Chords" : "Lyrics";

  // Fetch a fresh signed URL each open (Convex storage URLs expire).
  // useQuery returns undefined while loading, null if the song/file is gone.
  const fileInfo = useQuery(
    api.songs.getFileUrl,
    kindIsValid ? { id: songId as Id<"songs">, kind: rawKind } : "skip",
  );

  const isDocx = fileInfo?.ext === "docx";
  const fileUrl = fileInfo?.url ?? null;
  const displayName = songName || fileInfo?.songName || "";

  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    document.title = displayName ? `${displayName} — ${label}` : label;
  }, [displayName, label]);

  if (!kindIsValid) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ground text-muted text-sm">
        Invalid file kind.
      </div>
    );
  }

  if (fileInfo === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ground">
        <div className="w-5 h-5 border-2 border-raised border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (fileInfo === null || !fileUrl) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ground text-muted text-sm">
        File not found.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-ground">
      {/* Viewer fills the whole viewport; the header floats above it so it
          can fade away without reflowing the document. */}
      <div className="absolute inset-0">
        {isDocx ? (
          <DocxViewer
            url={fileUrl}
            chromeVisible={chromeVisible}
            onTap={() => setChromeVisible(v => !v)}
          />
        ) : (
          <iframe
            src={fileUrl}
            className="w-full h-full bg-white"
            title={displayName ? `${displayName} — ${label}` : label}
          />
        )}
      </div>

      <div
        className={`absolute top-0 inset-x-0 z-20 bg-ground border-b border-line px-4 h-14 flex items-center justify-between transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium truncate">{displayName || songId}</p>
          <p className="text-muted text-xs truncate">
            {label} · {isDocx ? "DOCX" : "PDF"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised ${TX}`}
          aria-label="Close viewer"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
