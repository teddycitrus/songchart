"use client"

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Minus, Moon, Plus, Sun, X } from "lucide-react";

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
        <p className="text-[#a1a1aa] text-sm text-center">Could not render file: {err}</p>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-5 h-5 border border-[#3f3f46] border-t-white rounded-full animate-spin" />
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
        className={`h-full w-full overflow-auto ${darkMode ? "bg-[#0a0a0a]" : "bg-white"}`}
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
        className={`absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-[#141414] border border-[#262626] shadow-lg px-1.5 py-1 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button
          type="button"
          onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= 0.001}
          className={`p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent ${TX}`}
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
          className="w-24 accent-white cursor-pointer"
          aria-label="Font size"
        />
        <button
          type="button"
          onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= 0.999}
          className={`p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent ${TX}`}
          aria-label="Increase font size"
        >
          <Plus size={14} />
        </button>
        <div className="w-px h-4 bg-[#262626] mx-1" />
        <button
          type="button"
          onClick={() => setDarkMode(d => !d)}
          className={`p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 ${TX}`}
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
  const params = useParams<{ kind: string; fileName: string }>();
  const searchParams = useSearchParams();

  const kind = params?.kind ?? "";
  const fileName = decodeURIComponent(params?.fileName ?? "");
  const songName = searchParams?.get("song") ?? "";

  const isDocx = fileName.toLowerCase().endsWith(".docx");
  const label = kind === "chords" ? "Chords" : "Lyrics";
  const fileUrl = `/api/files/${kind}/${encodeURIComponent(fileName)}`;

  // Chrome = header + floating docx controls. Tapping the docx body toggles.
  // PDFs keep chrome visible always (the iframe captures taps itself).
  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    document.title = songName ? `${songName} — ${label}` : label;
  }, [songName, label]);

  if (kind !== "chords" && kind !== "lyrics") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a] text-[#a1a1aa] text-sm">
        Invalid file kind.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0a]">
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
            title={songName ? `${songName} — ${label}` : label}
          />
        )}
      </div>

      <div
        className={`absolute top-0 inset-x-0 z-20 bg-[#0a0a0a] border-b border-white/10 px-4 py-3 flex items-center justify-between transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{songName || fileName}</p>
          <p className="text-[#a1a1aa] text-xs truncate">
            {label} · {isDocx ? "DOCX" : "PDF"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className={`p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 ${TX}`}
          aria-label="Close viewer"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
