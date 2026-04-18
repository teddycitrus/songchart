"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, ExternalLink, FileText, Link as LinkIcon, Lock,
  MessageSquareText, Minus, Moon, Paperclip, Pencil, Plus, Search, Shuffle, Sun, Trash2, Upload, X
} from "lucide-react";
import { Song } from "../types/Song";

// ── Design tokens ──────────────────────────────────────────────────────────
// Border radius  : rounded-md (4→6px) for inputs/buttons
//                  rounded-lg (8px) for modals/panels
//                  rounded-full for pills only
// Transitions    : duration-150 ease-in-out, per-property (no shorthand)
// Icons          : 14px standard, 16px for modal close/header only
// Type scale     : text-base headings · text-sm body/labels · text-xs meta
// Shadows        : shadow-lg for elevated panels only
// ──────────────────────────────────────────────────────────────────────────

const TX = "transition-[color,background-color,border-color,opacity] duration-150 ease-in-out";

// Type pill colors — full literals required for Tailwind JIT
const TYPE_PILLS: Record<string, string> = {
  entrance:    "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  communion:   "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  recessional: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  misc:        "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
};

const SONG_TYPES = ["entrance", "communion", "recessional", "misc"] as const;

// Shared input class — dark surface inside modals
const INPUT_CLS =
  "mt-1 w-full rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-sm text-white " +
  "placeholder:text-[#3f3f46] focus:outline-none focus:ring-1 focus:ring-white/30 " +
  "focus:border-white/30 transition-[border-color,box-shadow] duration-150 ease-in-out";

// Shared error box — used in every modal for submit/submit/auth errors
const ERR_BOX =
  "text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2";

// Shared button classes
const BTN_GHOST =
  `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-[#262626] text-white ${TX} hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed`;
const BTN_PRIMARY =
  `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-white text-[#0a0a0a] ${TX} hover:bg-[#e4e4e7] disabled:opacity-40 disabled:cursor-not-allowed`;
const BTN_DANGER =
  `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white ${TX} hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed`;

const COLUMNS: { key: keyof Song; label: string; sortable: boolean }[] = [
  { key: "name",      label: "Song",      sortable: true  },
  { key: "listen",    label: "Video",    sortable: false },
  { key: "chords",    label: "Chords",    sortable: false },
  { key: "lyrics",    label: "Lyrics",    sortable: false },
  { key: "key",       label: "Key",       sortable: true  },
  { key: "transpose", label: "Transpose", sortable: true  },
  { key: "capo",      label: "Capo",      sortable: true  },
  { key: "bpm",       label: "BPM",       sortable: true  },
  { key: "beat",      label: "Beat",      sortable: true  },
  { key: "type",      label: "Type",      sortable: false },
  { key: "notes",     label: "Notes",     sortable: false },
];

const EMPTY_FORM = {
  name: "", listen: "", chords: "", key: "", transpose: "",
  capo: "", bpm: "", beat: "",
  type: [] as string[],
  usage_counter: 0,
  lyrics: "",
  chordsFile: "",
  lyricsFile: "",
  notes: "",
};

type FormData = typeof EMPTY_FORM;

// ── Shared primitives ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
  );
}

// Renders a .docx file client-side with mammoth. Mammoth is dynamically
// imported so it only hits the bundle when someone actually opens a docx.
//
// Sizing strategy:
// 1. Render content with `width: max-content` so each paragraph takes its
//    natural width without wrapping. The element's `scrollWidth` then equals
//    the widest line in the document.
// 2. Scale uniformly so that widest line = available viewport width − gutter.
// 3. The wrapper div is sized to (natural × scale) to reserve layout space
//    for the transformed content, so vertical scroll still works.
function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // widthFit   = largest scale at which the widest LINE still fits horizontally
  //              (above this, lines would wrap / overflow — hard cap)
  // heightFit  = scale at which the FULL DOCUMENT (every line) fits vertically
  //              (below this just makes text smaller without showing more)
  // zoom       = 0..1, where 0 = heightFit (smallest useful size),
  //              1 = widthFit (largest size without warping)
  // scale      = what we actually apply to the transform
  const [widthFit, setWidthFit] = useState(1);
  const [heightFit, setHeightFit] = useState(1);
  // Default to 0 = smallest size where the whole document fits on screen.
  const [zoom, setZoom] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [darkMode, setDarkMode] = useState(false);

  const GUTTER_X = 48; // horizontal breathing room
  const GUTTER_Y = 32; // vertical breathing room for heightFit calculation
  const ZOOM_STEP = 0.1;

  // Linear interpolation from heightFit (zoom=0) → widthFit (zoom=1).
  // If heightFit >= widthFit (very short doc), they collapse to the same value
  // and the slider effectively becomes a no-op.
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

  // Measure natural content dimensions + compute scale.
  // Runs on mount, when content changes, and whenever the viewer resizes.
  useEffect(() => {
    if (html === null) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    const update = () => {
      // scrollWidth/scrollHeight give the natural (unscaled) dimensions
      // because the content div uses `width: max-content`.
      const naturalW = contentEl.scrollWidth;
      const naturalH = contentEl.scrollHeight;
      if (naturalW === 0 || naturalH === 0) return;

      const availW = scrollEl.clientWidth - GUTTER_X;
      const availH = scrollEl.clientHeight - GUTTER_Y;
      // widthFit  = scale where widest line fills the viewer width.
      // heightFit = scale where full document height fits in one view.
      // Clamped to widthFit so a very short doc doesn't blow past the width cap.
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

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} className={`h-full w-full overflow-auto ${darkMode ? "bg-[#0a0a0a]" : "bg-white"}`}>
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

      {/* Floating control bar — pinned to bottom-right of the viewer.
          Slider: 0 = smallest size where every line still fits on screen,
                  1 = largest size before text would wrap. */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-[#141414] border border-[#262626] shadow-lg px-1.5 py-1">
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

function ModalOverlay({ onClose, children }: { onClose?: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      {children}
    </div>
  );
}

function ModalPanel({
  title,
  subtitle,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  const maxW = size === "sm" ? "sm:max-w-sm" : "sm:max-w-lg";
  return (
    <div className={`bg-[#141414] border border-[#262626] rounded-t-lg sm:rounded-lg shadow-lg w-full ${maxW} mx-0 sm:mx-4 max-h-[92vh] flex flex-col`}>
      <div className="px-6 pt-5 pb-4 border-b border-[#262626] flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-white text-base font-semibold leading-snug">{title}</h2>
          {subtitle && <p className="text-[#a1a1aa] text-sm mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className={`ml-4 p-1 rounded-md text-[#71717a] hover:text-white ${TX}`} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#262626] shrink-0">
      {children}
    </div>
  );
}

// ── SongFormBody ───────────────────────────────────────────────────────────

// File-picker subcomponent used once each for chords + lyrics. Strict about
// .pdf/.docx at the browser level so users get immediate feedback, but the
// upload route does a magic-byte recheck on the server.
function FileSlot({
  idPrefix,
  savedFileName,   // filename already persisted in Mongo (edit mode)
  pickedFile,      // File just chosen from disk, not yet uploaded
  onPick,
  onClearSaved,
  onClearPicked,
}: {
  idPrefix: string;
  savedFileName: string;
  pickedFile: File | null;
  onPick: (f: File | null) => void;
  onClearSaved: () => void;
  onClearPicked: () => void;
}) {
  const inputId = `${idPrefix}-file`;
  const hasSaved = !!savedFileName && !pickedFile;
  const hasPicked = !!pickedFile;

  return (
    <div className="mt-2">
      {hasSaved && (
        <div className="flex items-center justify-between rounded-md border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-white min-w-0">
            <FileText size={12} className="shrink-0 text-[#71717a]" />
            <span className="truncate">{savedFileName}</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <label htmlFor={inputId} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-white border border-[#262626] hover:bg-[#1a1a1a] cursor-pointer ${TX}`}>
              <Upload size={11} /> Replace
            </label>
            <button
              type="button"
              onClick={onClearSaved}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#71717a] hover:text-red-400 ${TX}`}
              title="Remove file"
            >
              <X size={11} /> Remove
            </button>
          </div>
        </div>
      )}

      {hasPicked && pickedFile && (
        <div className="flex items-center justify-between rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-white min-w-0">
            <Paperclip size={12} className="shrink-0 text-white" />
            <span className="truncate">{pickedFile.name}</span>
            <span className="text-[#71717a] shrink-0">
              ({(pickedFile.size / 1024).toFixed(0)} KB)
            </span>
          </span>
          <button
            type="button"
            onClick={onClearPicked}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[#71717a] hover:text-red-400 ${TX} shrink-0`}
            title="Discard"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {!hasSaved && !hasPicked && (
        <label
          htmlFor={inputId}
          className={`flex items-center justify-center gap-1.5 rounded-md border border-dashed border-[#262626] px-3 py-2 text-xs text-[#71717a] hover:text-white hover:border-[#3f3f46] cursor-pointer ${TX}`}
        >
          <Upload size={12} /> Upload PDF or DOCX
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          // Reset the input element's value so re-picking the same file works.
          e.target.value = "";
          if (!f) return;
          const name = f.name.toLowerCase();
          if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
            alert("Only PDF or DOCX files are allowed.");
            return;
          }
          if (f.size > 10 * 1024 * 1024) {
            alert("File must be ≤ 10 MB.");
            return;
          }
          onPick(f);
        }}
      />
    </div>
  );
}

function SongFormBody({
  formData,
  readOnlyName,
  submitError,
  onChangeText,
  onTypeToggle,
  chordsFileUpload,
  lyricsFileUpload,
  onPickChordsFile,
  onPickLyricsFile,
  onClearSavedChordsFile,
  onClearSavedLyricsFile,
  onClearPickedChordsFile,
  onClearPickedLyricsFile,
}: {
  formData: FormData;
  readOnlyName?: boolean;
  submitError: string;
  onChangeText: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onTypeToggle: (t: string, checked: boolean) => void;
  chordsFileUpload: File | null;
  lyricsFileUpload: File | null;
  onPickChordsFile: (f: File | null) => void;
  onPickLyricsFile: (f: File | null) => void;
  onClearSavedChordsFile: () => void;
  onClearSavedLyricsFile: () => void;
  onClearPickedChordsFile: () => void;
  onClearPickedLyricsFile: () => void;
}) {
  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-white text-sm font-medium">
            Title<span className="text-red-400 ml-0.5">*</span>
          </label>
          <input
            required id="name"
            className={INPUT_CLS + (readOnlyName ? " opacity-60 cursor-not-allowed" : "")}
            value={formData.name} onChange={onChangeText}
            readOnly={readOnlyName} placeholder="10,000 Reasons"
          />
        </div>
        <div>
          <label className="text-white text-sm font-medium">Key</label>
          <input id="key" className={INPUT_CLS} value={formData.key} onChange={onChangeText} placeholder="G Major" />
        </div>
      </div>

      <div>
        <label className="text-white text-sm font-medium">Video URL</label>
        <input
          type="url" id="listen" className={INPUT_CLS}
          value={formData.listen} onChange={onChangeText} placeholder="https://..."
        />
      </div>

      <div>
        <label className="text-white text-sm font-medium">
          Chords<span className="text-red-400 ml-0.5">*</span>
          <span className="text-[#71717a] font-normal ml-1">— link or file</span>
        </label>
        <input
          type="url" id="chords" className={INPUT_CLS}
          value={formData.chords} onChange={onChangeText} placeholder="https://..."
        />
        <FileSlot
          idPrefix="chords"
          savedFileName={formData.chordsFile}
          pickedFile={chordsFileUpload}
          onPick={onPickChordsFile}
          onClearSaved={onClearSavedChordsFile}
          onClearPicked={onClearPickedChordsFile}
        />
      </div>

      <div>
        <label className="text-white text-sm font-medium">
          Lyrics<span className="text-red-400 ml-0.5">*</span>
          <span className="text-[#71717a] font-normal ml-1">— link or file</span>
        </label>
        <input
          type="url" id="lyrics" className={INPUT_CLS}
          value={formData.lyrics} onChange={onChangeText} placeholder="https://..."
        />
        <FileSlot
          idPrefix="lyrics"
          savedFileName={formData.lyricsFile}
          pickedFile={lyricsFileUpload}
          onPick={onPickLyricsFile}
          onClearSaved={onClearSavedLyricsFile}
          onClearPicked={onClearPickedLyricsFile}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-white text-sm font-medium">Transpose</label>
          <input id="transpose" className={INPUT_CLS} value={formData.transpose} onChange={onChangeText} placeholder="0" />
        </div>
        <div>
          <label className="text-white text-sm font-medium">Capo</label>
          <input id="capo" className={INPUT_CLS} value={formData.capo} onChange={onChangeText} placeholder="0" />
        </div>
        <div>
          <label className="text-white text-sm font-medium">BPM</label>
          <input id="bpm" className={INPUT_CLS} value={formData.bpm} onChange={onChangeText} placeholder="77" />
        </div>
      </div>

      <div>
        <label className="text-white text-sm font-medium">Beat</label>
        <input id="beat" className={INPUT_CLS} value={formData.beat} onChange={onChangeText} placeholder="EtherealMovie" />
      </div>

      <div>
        <p className="text-white text-sm font-medium mb-2">Type</p>
        <div className="flex flex-wrap gap-2">
          {SONG_TYPES.map(t => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox" value={t}
                checked={formData.type.includes(t)}
                onChange={e => onTypeToggle(t, e.target.checked)}
                className="rounded-sm accent-white"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_PILLS[t]}`}>{t}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-white text-sm font-medium">Notes</label>
        <textarea
          id="notes"
          className={INPUT_CLS + " resize-y min-h-[60px]"}
          value={formData.notes}
          onChange={onChangeText}
          placeholder="Any extra info about this song..."
          rows={3}
        />
      </div>

      {submitError && (
        <p className={ERR_BOX}>{submitError}</p>
      )}
    </div>
  );
}

// ── Home ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Song>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [chordsFileUpload, setChordsFileUpload] = useState<File | null>(null);
  const [lyricsFileUpload, setLyricsFileUpload] = useState<File | null>(null);
  // Auth token issued by /api/checkAuth. Kept in state + sessionStorage so
  // reloads within a tab stay signed in but closing the tab drops it.
  const [authToken, setAuthToken] = useState<string | null>(null);
  // Chooser modal — shows Link / File options for a given song column.
  const [sourceChooser, setSourceChooser] = useState<{ kind: "chords" | "lyrics"; song: Song } | null>(null);
  // File viewer modal — full-screen iframe pointed at /api/files/[kind]/[id]
  const [fileViewer, setFileViewer] = useState<{ kind: "chords" | "lyrics"; fileName: string; songName: string } | null>(null);
  // Notes viewer modal — shows plain-text notes for a song.
  const [notesViewer, setNotesViewer] = useState<Song | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [showRepertoireModal, setShowRepertoireModal] = useState(false);
  const [repertoire, setRepertoire] = useState<{ entrance: Song; communion: Song; recessional: Song } | null>(null);
  const [repertoireError, setRepertoireError] = useState("");
  // Horizontal-scroll tracking — when the table container is scrolled right,
  // the sticky Song column becomes a "floating" label (transparent, smaller).
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableScrolled, setTableScrolled] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      if (!res.ok) throw new Error("Failed to fetch songs");
      setSongs(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  // Restore any session-persisted auth token on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem("songchart_token");
    if (saved) {
      setAuthToken(saved);
      setAuth(true);
    }
  }, []);
  const poop = deleteError;
  console.log(poop);
  // Track whether the table is horizontally scrolled, so the sticky Song
  // column can collapse to a smaller, transparent floating label.
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setTableScrolled(el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [loading]);

  // Authenticated fetch helper — adds the Bearer token and handles 401 by
  // clearing state and prompting the user to sign in again.
  const authFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) {
      setAuth(false);
      setAuthToken(null);
      if (typeof window !== "undefined") window.sessionStorage.removeItem("songchart_token");
      throw new Error("Your session expired. Please sign in again.");
    }
    return res;
  }, [authToken]);

  // POST a single file to /api/files/upload and return the B2 filename.
  const uploadSongFile = useCallback(async (kind: "chords" | "lyrics", file: File): Promise<string> => {
    const fd = new window.FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    const res = await authFetch("/api/files/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Upload failed (${res.status})`);
    }
    const data = await res.json() as { fileName: string };
    return data.fileName;
  }, [authFetch]);

  useEffect(() => {
    if (selectedSong) {
      setFormData({
        name: selectedSong.name, listen: selectedSong.listen ?? "",
        chords: selectedSong.chords, key: selectedSong.key, transpose: selectedSong.transpose,
        capo: selectedSong.capo, bpm: selectedSong.bpm, beat: selectedSong.beat,
        type: selectedSong.type ?? [], usage_counter: selectedSong.usage_counter ?? 0,
        lyrics: selectedSong.lyrics ?? "",
        chordsFile: selectedSong.chordsFile ?? "",
        lyricsFile: selectedSong.lyricsFile ?? "",
        notes: selectedSong.notes ?? "",
      });
    }
  }, [selectedSong]);

  const filteredSongs = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = songs.filter(s => s.name.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc"
        ? av.localeCompare(bv, "en", { sensitivity: "base" })
        : bv.localeCompare(av, "en", { sensitivity: "base" });
    });
  }, [songs, search, sortKey, sortDir]);

  function toggleSort(key: keyof Song) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));

  const handleTypeToggle = (t: string, checked: boolean) =>
    setFormData(prev => ({
      ...prev,
      type: checked ? [...prev.type, t] : prev.type.filter(x => x !== t),
    }));

  const requireAuth = (action: () => void) => {
    if (auth) { action(); return; }
    setPendingAction(() => action);
    setShowAuthModal(true);
  };

  const checkAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("auth") as HTMLInputElement;
    const res = await fetch("/api/checkAuth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: input.value }),
    });
    if (res.status === 429) {
      setAuthError("Too many attempts. Try again later.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.ok && typeof data.token === "string") {
      setAuth(true);
      setAuthToken(data.token);
      if (typeof window !== "undefined") window.sessionStorage.setItem("songchart_token", data.token);
      setAuthError("");
      setShowAuthModal(false);
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } else {
      setAuthError("Incorrect password.");
    }
  };

  // Validate chords/lyrics: at least one of (URL, saved file, picked file).
  function validateSources(): string | null {
    const hasChords =
      !!formData.chords.trim() || !!formData.chordsFile || !!chordsFileUpload;
    const hasLyrics =
      !!formData.lyrics.trim() || !!formData.lyricsFile || !!lyricsFileUpload;
    if (!hasChords) return "Chords: provide a URL or upload a file.";
    if (!hasLyrics) return "Lyrics: provide a URL or upload a file.";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const invalid = validateSources();
      if (invalid) throw new Error(invalid);

      // Upload any picked files first so the song row lands with a valid filename.
      let chordsFileName = formData.chordsFile;
      let lyricsFileName = formData.lyricsFile;
      if (chordsFileUpload) chordsFileName = await uploadSongFile("chords", chordsFileUpload);
      if (lyricsFileUpload) lyricsFileName = await uploadSongFile("lyrics", lyricsFileUpload);

      const payload = { ...formData, chordsFile: chordsFileName, lyricsFile: lyricsFileName };
      const res = await authFetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to add song");

      setShowAddModal(false);
      setFormData({ ...EMPTY_FORM });
      setChordsFileUpload(null);
      setLyricsFileUpload(null);
      await fetchSongs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const invalid = validateSources();
      if (invalid) throw new Error(invalid);

      // Upload newly picked files (replaces any existing saved file).
      let chordsFileName = formData.chordsFile;
      let lyricsFileName = formData.lyricsFile;
      if (chordsFileUpload) chordsFileName = await uploadSongFile("chords", chordsFileUpload);
      if (lyricsFileUpload) lyricsFileName = await uploadSongFile("lyrics", lyricsFileUpload);

      const payload = {
        ...formData,
        chordsFile: chordsFileName,
        lyricsFile: lyricsFileName,
        _id: selectedSong?._id,
      };
      const res = await authFetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update song");

      setShowEditModal(false);
      setSelectedSong(null);
      setChordsFileUpload(null);
      setLyricsFileUpload(null);
      await fetchSongs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Weighted random pick — songs with lower usage_counter are more likely selected
  function weightedPick(pool: Song[]): Song {
    const weights = pool.map(s => 1 / (1 + (s.usage_counter ?? 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  const generateRepertoire = () => {
    setRepertoireError("");
    const byType = (t: string) => songs.filter(s => s.type?.includes(t));
    const entrancePool    = byType("entrance");
    const communionPool   = byType("communion");
    const recessionalPool = byType("recessional");

    const missing = [
      entrancePool.length === 0    && "entrance",
      communionPool.length === 0   && "communion",
      recessionalPool.length === 0 && "recessional",
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      setRepertoire(null);
      setRepertoireError(`No songs tagged as: ${missing.join(", ")}.`);
      return;
    }

    setRepertoire({
      entrance:    weightedPick(entrancePool),
      communion:   weightedPick(communionPool),
      recessional: weightedPick(recessionalPool),
    });
  };

  const confirmRepertoire = async () => {
    if (!repertoire) return;
    setConfirming(true);
    try {
      const res = await authFetch("/api/increment-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [repertoire.entrance._id, repertoire.communion._id, repertoire.recessional._id],
        }),
      });
      if (!res.ok) throw new Error("Failed to update usage");
      setShowRepertoireModal(false);
      setRepertoire(null);
      await fetchSongs();
    } catch (err) {
      setRepertoireError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setConfirming(false);
    }
  };

  const confirmDelete = async () => {
    if (!songToDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await authFetch("/api/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: songToDelete._id }),
      });
      if (!res.ok) throw new Error("Failed to delete song");
      setSongToDelete(null);
      await fetchSongs();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="w-5 h-5 border border-[#3f3f46] border-t-[#71717a] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <p className="text-[#71717a] text-sm">{error}</p>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Auth modal */}
      {showAuthModal && (
        <ModalOverlay onClose={() => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); }}>
          <ModalPanel
            title="sign in"
            subtitle="oooopen sesame"
            size="sm"
            onClose={() => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); }}
          >
            <form onSubmit={checkAuth}>
              <div className="px-6 py-5 space-y-3">
                <div>
                  <label className="text-white text-sm font-medium">Password</label>
                  <input
                    type="password" name="auth" className={INPUT_CLS}
                    placeholder="Password" autoFocus
                  />
                </div>
                {authError && (
                  <p className={ERR_BOX}>{authError}</p>
                )}
              </div>
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); }}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button type="submit" className={BTN_PRIMARY}>
                  <Lock size={14} /> Continue
                </button>
              </ModalFooter>
            </form>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Delete confirmation modal */}
      {songToDelete && (
        <ModalOverlay onClose={() => { if (!deleting) { setSongToDelete(null); setDeleteError(""); } }}>
          <ModalPanel
            title="delete song"
            subtitle={`you really wanna erase "${songToDelete.name}" from the database? there's no redo or ctrl+z on this one`}
            size="sm"
            onClose={() => { if (!deleting) { setSongToDelete(null); setDeleteError(""); } }}
          >
            
            <ModalFooter>
              <button
                type="button"
                onClick={() => { setSongToDelete(null); setDeleteError(""); }}
                disabled={deleting}
                className={BTN_GHOST}
              >
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting} className={BTN_DANGER}>
                {deleting ? <><Spinner /> Deleting...</> : <><Trash2 size={14} /> Delete</>}
              </button>
            </ModalFooter>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Add song modal */}
      {showAddModal && (
        <ModalOverlay onClose={() => {
          if (!submitting) {
            setShowAddModal(false); setSubmitError("");
            setChordsFileUpload(null); setLyricsFileUpload(null);
          }
        }}>
          <ModalPanel
            title="Add song"
            onClose={() => {
              if (!submitting) {
                setShowAddModal(false); setSubmitError("");
                setChordsFileUpload(null); setLyricsFileUpload(null);
              }
            }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col">
              <SongFormBody
                formData={formData} submitError={submitError}
                onChangeText={handleChange} onTypeToggle={handleTypeToggle}
                chordsFileUpload={chordsFileUpload}
                lyricsFileUpload={lyricsFileUpload}
                onPickChordsFile={setChordsFileUpload}
                onPickLyricsFile={setLyricsFileUpload}
                onClearSavedChordsFile={() => setFormData(p => ({ ...p, chordsFile: "" }))}
                onClearSavedLyricsFile={() => setFormData(p => ({ ...p, lyricsFile: "" }))}
                onClearPickedChordsFile={() => setChordsFileUpload(null)}
                onClearPickedLyricsFile={() => setLyricsFileUpload(null)}
              />
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false); setSubmitError("");
                    setChordsFileUpload(null); setLyricsFileUpload(null);
                  }}
                  disabled={submitting}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
                  {submitting ? <><Spinner /> Saving...</> : <><Plus size={14} /> Add song</>}
                </button>
              </ModalFooter>
            </form>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Edit song modal */}
      {showEditModal && selectedSong && (
        <ModalOverlay onClose={() => {
          if (!submitting) {
            setShowEditModal(false); setSelectedSong(null); setSubmitError("");
            setChordsFileUpload(null); setLyricsFileUpload(null);
          }
        }}>
          <ModalPanel
            title="edit song"
            subtitle="you couldn't get it right the first time?"
            onClose={() => {
              if (!submitting) {
                setShowEditModal(false); setSelectedSong(null); setSubmitError("");
                setChordsFileUpload(null); setLyricsFileUpload(null);
              }
            }}
          >
            <form onSubmit={handleUpdate} className="flex flex-col">
              <SongFormBody
                formData={formData} readOnlyName submitError={submitError}
                onChangeText={handleChange} onTypeToggle={handleTypeToggle}
                chordsFileUpload={chordsFileUpload}
                lyricsFileUpload={lyricsFileUpload}
                onPickChordsFile={setChordsFileUpload}
                onPickLyricsFile={setLyricsFileUpload}
                onClearSavedChordsFile={() => setFormData(p => ({ ...p, chordsFile: "" }))}
                onClearSavedLyricsFile={() => setFormData(p => ({ ...p, lyricsFile: "" }))}
                onClearPickedChordsFile={() => setChordsFileUpload(null)}
                onClearPickedLyricsFile={() => setLyricsFileUpload(null)}
              />
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false); setSelectedSong(null); setSubmitError("");
                    setChordsFileUpload(null); setLyricsFileUpload(null);
                  }}
                  disabled={submitting}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
                  {submitting ? <><Spinner /> Saving...</> : "Save changes"}
                </button>
              </ModalFooter>
            </form>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Repertoire modal */}
      {showRepertoireModal && (
        <ModalOverlay onClose={() => { if (!confirming) { setShowRepertoireModal(false); setRepertoire(null); setRepertoireError(""); } }}>
          <ModalPanel
            title="random repertoire"
            subtitle="if ur too lazy to pick songs manually ig"
            onClose={() => { if (!confirming) { setShowRepertoireModal(false); setRepertoire(null); setRepertoireError(""); } }}
          >
            <div className="px-6 py-5 space-y-3">
              {repertoireError && (
                <p className={ERR_BOX}>{repertoireError}</p>
              )}
              {repertoire && (
                <div className="space-y-2">
                  {(["entrance", "communion", "recessional"] as const).map(slot => {
                    const song = repertoire[slot];
                    return (
                      <div key={slot} className="flex items-center justify-between rounded-md border border-[#262626] bg-[#0a0a0a] px-4 py-3">
                        <div>
                          <p className="text-white text-sm font-medium">{song.name}</p>
                          <p className="text-[#71717a] text-xs mt-0.5">{song.key || "—"}{song.bpm ? ` · ${song.bpm} bpm` : ""}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_PILLS[slot]}`}>{slot}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <ModalFooter>
              <button
                type="button"
                onClick={generateRepertoire}
                disabled={confirming}
                className={`${BTN_GHOST} disabled:opacity-40`}
              >
                <Shuffle size={14} /> Respin
              </button>
              <button
                onClick={confirmRepertoire}
                disabled={confirming || !repertoire}
                className={BTN_PRIMARY}
              >
                {confirming ? <><Spinner /> Confirming...</> : "Confirm lineup"}
              </button>
            </ModalFooter>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Source chooser — shown when a user clicks "open" on Chords or Lyrics */}
      {sourceChooser && (() => {
        const { kind, song } = sourceChooser;
        const url = kind === "chords" ? song.chords : song.lyrics;
        const fileName = kind === "chords" ? song.chordsFile : song.lyricsFile;
        const label = kind === "chords" ? "Chords" : "Lyrics";
        return (
          <ModalOverlay onClose={() => setSourceChooser(null)}>
            <ModalPanel
              title={label}
              subtitle={song.name}
              size="sm"
              onClose={() => setSourceChooser(null)}
            >
              <div className="px-6 py-5 space-y-2">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between rounded-md border border-[#262626] bg-[#0a0a0a] px-4 py-3 text-sm text-white hover:bg-[#1a1a1a] hover:border-[#3f3f46] ${TX}`}
                    onClick={() => setSourceChooser(null)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LinkIcon size={14} /> Link
                    </span>
                    <ExternalLink size={12} className="text-[#71717a]" />
                  </a>
                ) : null}
                {fileName ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFileViewer({ kind, fileName, songName: song.name });
                      setSourceChooser(null);
                    }}
                    className={`w-full flex items-center justify-between rounded-md border border-[#262626] bg-[#0a0a0a] px-4 py-3 text-sm text-white hover:bg-[#1a1a1a] hover:border-[#3f3f46] ${TX}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileText size={14} /> File
                    </span>
                    <span className="text-[#71717a] text-xs">{fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "DOCX"}</span>
                  </button>
                ) : null}
                {!url && !fileName && (
                  <p className="text-[#71717a] text-sm text-center">No sources available.</p>
                )}
              </div>
              <ModalFooter>
                <button type="button" onClick={() => setSourceChooser(null)} className={BTN_GHOST}>
                  Close
                </button>
              </ModalFooter>
            </ModalPanel>
          </ModalOverlay>
        );
      })()}

      {/* Notes viewer modal */}
      {notesViewer && (
        <ModalOverlay onClose={() => setNotesViewer(null)}>
          <ModalPanel
            title="Notes"
            subtitle={notesViewer.name}
            size="sm"
            onClose={() => setNotesViewer(null)}
          >
            <div className="px-6 py-5">
              <p className="text-[#a1a1aa] text-sm whitespace-pre-wrap">{notesViewer.notes || "No notes."}</p>
            </div>
            <ModalFooter>
              <button type="button" onClick={() => setNotesViewer(null)} className={BTN_GHOST}>
                Close
              </button>
            </ModalFooter>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* File viewer — full-screen. PDFs render natively via <iframe>;
          .docx is converted to HTML client-side by mammoth (DocxViewer). */}
      {fileViewer && (() => {
        const fileUrl = `/api/files/${fileViewer.kind}/${encodeURIComponent(fileViewer.fileName)}`;
        const isDocx = fileViewer.fileName.toLowerCase().endsWith(".docx");
        return (
          <div
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex flex-col"
            onMouseDown={e => { if (e.target === e.currentTarget) setFileViewer(null); }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{fileViewer.songName}</p>
                <p className="text-[#a1a1aa] text-xs truncate">
                  {fileViewer.kind === "chords" ? "Chords" : "Lyrics"} · {isDocx ? "DOCX" : "PDF"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFileViewer(null)}
                className={`p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 ${TX}`}
                aria-label="Close viewer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {isDocx ? (
                <DocxViewer url={fileUrl} />
              ) : (
                <iframe
                  src={fileUrl}
                  className="w-full h-full bg-white"
                  title={`${fileViewer.songName} — ${fileViewer.kind}`}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-white italic text-3xl font-semibold tracking-tight">SongChart</h1>        </div>
        <div className="flex items-center gap-2">
          {auth && (
            <button
              onClick={() => { setShowRepertoireModal(true); generateRepertoire(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#141414] border border-[#262626] text-white ${TX} hover:bg-[#1a1a1a]`}
            >
              <Shuffle size={14} /> Generate lineup
            </button>
          )}
          <button
            onClick={() => requireAuth(() => { setFormData({ ...EMPTY_FORM }); setShowAddModal(true); })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#141414] border border-[#262626] text-white ${TX} hover:bg-[#1a1a1a]`}
          >
            <Plus size={14} /> Add song
          </button>
          {!auth && (
            <button
              onClick={() => setShowAuthModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-[#71717a] ${TX} hover:text-white`}
            >
              <Lock size={14} /> Sign in
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b border-[#262626] flex items-center gap-2">
        <Search size={14} className="text-[#71717a] shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search songs..."
          className="bg-transparent text-sm text-white placeholder:text-[#71717a] outline-none flex-1"
        />
        {search && (
          <button onClick={() => setSearch("")} className={`text-[#71717a] hover:text-white ${TX}`}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      {(() => {
        // Skip the sticky Song column entirely when there's only one result —
        // the user searched, narrowed to a single row, they already know which
        // song they're looking at, so the column can just scroll naturally.
        const pinSongColumn = filteredSongs.length > 1;
        const showFloatingTitle = pinSongColumn && tableScrolled;
        return (
      <div ref={tableWrapRef} className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#262626]">
              {COLUMNS.map((col, i) => {
                const isFirst = i === 0;
                const stickyCls = !isFirst || !pinSongColumn
                  ? ""
                  : showFloatingTitle
                    // Hide the "Song" header text when scrolled — floating row
                    // labels below make it redundant, and this keeps the top-left
                    // corner transparent so underlying content is visible.
                    ? "sticky left-0 z-20 bg-transparent pointer-events-none invisible"
                    : "sticky left-0 z-20 bg-[#0a0a0a] border-r border-[#1a1a1a]";
                return (
                  <th
                    key={col.key}
                    onClick={() => col.sortable ? toggleSort(col.key) : undefined}
                    className={`px-4 py-3 text-left text-xs font-medium text-[#71717a] whitespace-nowrap select-none ${col.sortable ? `cursor-pointer hover:text-[#a1a1aa] ${TX}` : ""} ${stickyCls}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        sortDir === "asc"
                          ? <ChevronUp size={12} className="text-[#a1a1aa]" />
                          : <ChevronDown size={12} className="text-[#a1a1aa]" />
                      )}
                    </span>
                  </th>
                );
              })}
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {filteredSongs.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-[#71717a] text-sm">
                  {search ? `No results for "${search}"` : "No songs yet."}
                </td>
              </tr>
            ) : (
              filteredSongs.map(song => (
                <tr key={song._id} className={`border-b border-[#1a1a1a] hover:bg-[#141414] group ${TX}`}>
                  <td
                    className={`whitespace-nowrap text-white font-medium ${TX} ${
                      !pinSongColumn
                        // Single-result case: plain cell, no stickiness.
                        ? "px-4 py-3 text-sm"
                        : showFloatingTitle
                          // Floating label: transparent, tight left padding so it
                          // hugs the viewport edge, smaller font, subtle shadow
                          // so it stays legible over scrolled content below.
                          ? "sticky left-0 z-10 bg-transparent pointer-events-none px-2 py-3 text-xs [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_6px_rgba(0,0,0,0.7)]"
                          // Pinned solid cell when the column is naturally visible.
                          : "sticky left-0 z-10 bg-[#0a0a0a] group-hover:bg-[#141414] border-r border-[#1a1a1a] px-4 py-3 text-sm"
                    }`}
                  >
                    {song.name}
                  </td>
                  <td className="px-4 py-3">
                    {song.listen ? (
                      <a
                        href={song.listen} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs text-[#71717a] hover:text-[#a1a1aa] ${TX}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={12} /> open
                      </a>
                    ) : <span className="text-[#3f3f46]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(song.chords || song.chordsFile) ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSourceChooser({ kind: "chords", song }); }}
                        className={`inline-flex items-center gap-1 text-xs text-[#71717a] hover:text-[#a1a1aa] ${TX}`}
                      >
                        <ExternalLink size={12} /> open
                      </button>
                    ) : <span className="text-[#3f3f46]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(song.lyrics || song.lyricsFile) ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSourceChooser({ kind: "lyrics", song }); }}
                        className={`inline-flex items-center gap-1 text-xs text-[#71717a] hover:text-[#a1a1aa] ${TX}`}
                      >
                        <ExternalLink size={12} /> open
                      </button>
                    ) : <span className="text-[#3f3f46]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#71717a] text-sm">{song.key || <span className="text-[#3f3f46]">—</span>}</td>
                  <td className="px-4 py-3 text-[#71717a] text-sm">{song.transpose || <span className="text-[#3f3f46]">—</span>}</td>
                  <td className="px-4 py-3 text-[#71717a] text-sm">{song.capo || <span className="text-[#3f3f46]">—</span>}</td>
                  <td className="px-4 py-3 text-[#71717a] text-sm">{song.bpm || <span className="text-[#3f3f46]">—</span>}</td>
                  <td className="px-4 py-3 text-[#71717a] text-sm">{song.beat || <span className="text-[#3f3f46]">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {song.type && song.type.length > 0
                        ? song.type.map(t => (
                            <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_PILLS[t] ?? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"}`}>
                              {t}
                            </span>
                          ))
                        : <span className="text-[#3f3f46]">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {song.notes ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setNotesViewer(song); }}
                        className={`inline-flex items-center gap-1 text-xs text-[#71717a] hover:text-[#a1a1aa] ${TX}`}
                      >
                        <MessageSquareText size={12} /> view
                      </button>
                    ) : <span className="text-[#3f3f46]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex gap-0.5 opacity-0 group-hover:opacity-100 ${TX}`}>
                      <button
                        onClick={() => requireAuth(() => { setSelectedSong(song); setShowEditModal(true); })}
                        className={`p-1.5 rounded-md text-[#71717a] hover:text-white hover:bg-[#262626] ${TX}`}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => requireAuth(() => { setDeleteError(""); setSongToDelete(song); })}
                        className={`p-1.5 rounded-md text-[#71717a] hover:text-red-400 hover:bg-[#262626] ${TX}`}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#262626]">
              <td colSpan={COLUMNS.length + 1} className="px-4 py-2.5 text-[#3f3f46] text-xs">
                {filteredSongs.length} {filteredSongs.length === 1 ? "song" : "songs"}
                {search && ` matching "${search}"`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
        );
      })()}

      {/* Footer */}
      <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pb-4 pointer-events-none">
        <p
          className="text-[11px] text-[#3f3f46] tracking-wide"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
        >
          made by{" "}
          <span
            className="relative inline-block pointer-events-auto"
            onMouseEnter={() => setShowCredits(true)}
            onMouseLeave={() => setShowCredits(false)}
          >
            {/* Speech bubble — pointer-events-none so it never intercepts clicks
                on table rows above, and vanishes instantly when the cursor
                leaves the "john mannully" text. */}
            <span
              className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-64 pointer-events-none transition-opacity duration-150 ease-in-out ${showCredits ? "opacity-100" : "opacity-0"}`}
            >
              <span className="block bg-[#1a1a1a] border border-[#262626] rounded-md px-3 py-2.5 text-left shadow-lg">
                <span className="block text-[#a1a1aa] text-[10px] leading-relaxed" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "normal" }}>
                  ZERO contributions of ANY sort were made by the following individuals:
                </span>
                <span className="block mt-1.5 space-y-0.5 text-[10px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "normal" }}>
                  <span className="block text-[#71717a]">
                    -{" "}
                    <a href="https://www.linkedin.com/in/anvin-siby-6004a1310/" target="_blank" rel="noopener noreferrer" className={`text-[#a1a1aa] underline underline-offset-2 hover:text-white ${TX}`}>
                      anvin siby
                    </a>
                  </span>
                  <span className="block text-[#71717a]">
                    -{" "}
                    <a href="https://www.linkedin.com/in/joel-joseph-369399344/" target="_blank" rel="noopener noreferrer" className={`text-[#a1a1aa] underline underline-offset-2 hover:text-white ${TX}`}>
                      joel joseph
                    </a>
                  </span>
                </span>
              </span>
              <span className="block w-0 h-0 mx-auto border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#262626]" />
            </span>
            <span
              className="italic cursor-default"
              style={{ fontFamily: '"PP Editorial New", "Times New Roman", serif' }}
            >
              john mannully
            </span>
          </span>
          {" "}for the SACM youth choir
        </p>
      </div>

    </div>
  );
}
