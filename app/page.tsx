"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, ExternalLink, Lock, Pencil, Plus, Search, Shuffle, Trash2, X
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Song } from "../types/Song";

// ── Design tokens ──────────────────────────────────────────────────────────
// Colours       : CSS custom properties in globals.css, mapped to Tailwind
//                 roles (ground, surface, raised, ink, muted, faint, accent)
// Elevation     : lightness steps only (ground → surface → raised), no borders
//                 on cards, shadows only on dialogs and popovers
// Border radius : rounded-full for controls · 14px nested panels · 20px cards
// Accent        : candle gold, only on the mark and the selected part filter
// Transitions   : 150ms ease-out on colour, opacity and press scale
// Icons         : 16px, outline, grey
// Type scale    : 20 title · 16 dialog title · 14 body · 13 meta · 12 labels
// ──────────────────────────────────────────────────────────────────────────

const TX = "transition-[color,background-color,border-color,opacity,transform] duration-150 ease-out";

const SONG_TYPES = ["entrance", "communion", "recessional", "misc"] as const;
type SongType = typeof SONG_TYPES[number];

const PART_LABELS: Record<string, string> = {
  entrance: "Entrance",
  communion: "Communion",
  recessional: "Recessional",
  misc: "Misc",
};

// Neutral chip for a mass part. Parts are categories, not status, so they
// carry no hue.
const CHIP =
  "inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full bg-raised px-2.5 text-xs text-muted";

// Shared input classes — dark well inside the dialog surface
const FIELD =
  "mt-2 w-full border border-control bg-ground px-4 text-sm text-ink placeholder:text-faint " +
  "focus:outline-none focus:border-muted transition-[border-color] duration-150 ease-out";
const INPUT_CLS = `${FIELD} h-10 rounded-full`;
const TEXTAREA_CLS = `${FIELD} rounded-[14px] py-2.5 leading-6 resize-y min-h-[88px]`;
const LABEL_CLS = "text-sm font-medium text-ink";

// Shared error box — used in every modal for submit/submit/auth errors
const ERR_BOX = "rounded-[14px] bg-negative-bg px-4 py-2.5 text-[13px] text-negative";

// Shared button classes
const BTN_BASE =
  `inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium ${TX} ` +
  "active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
const BTN_GHOST   = `${BTN_BASE} bg-raised text-ink hover:bg-raised-hover`;
const BTN_PRIMARY = `${BTN_BASE} bg-ink text-ground hover:bg-ink-hover`;
const BTN_DANGER  = `${BTN_BASE} bg-negative text-white hover:bg-negative-hover`;
const ICON_BTN =
  `inline-flex h-8 w-8 items-center justify-center rounded-full text-faint ${TX} active:scale-[0.94]`;

// `numeric` columns are right-aligned with tabular figures so digits line up by
// place value (column reads as a number, not as text).
const COLUMNS: { key: keyof Song; label: string; sortable: boolean; numeric?: boolean }[] = [
  { key: "name",      label: "Song",      sortable: true  },
  { key: "chords",    label: "Open",      sortable: false },
  { key: "key",       label: "Key",       sortable: true  },
  { key: "capo",      label: "Capo",      sortable: true, numeric: true },
  { key: "bpm",       label: "BPM",       sortable: true, numeric: true },
  { key: "beat",      label: "Beat",      sortable: true  },
  { key: "type",      label: "Part",      sortable: false },
];

const EMPTY_FORM = {
  name: "", listen: "", chords: "", key: "",
  capo: "", bpm: "", beat: "",
  type: [] as string[],
  usage_counter: 0,
  lyrics: "",
  // Convex storage IDs (strings). Empty string = no file attached.
  chordsStorageId: "",
  lyricsStorageId: "",
  // Visible-only metadata used by FileSlot to label the "saved file" pill.
  // Not sent to the server — derived from the selected song on hydrate.
  chordsFileType: null as "pdf" | "docx" | null,
  lyricsFileType: null as "pdf" | "docx" | null,
  notes: "",
};

type FormData = typeof EMPTY_FORM;

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ── Shared primitives ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
  );
}

// SongChart's mark: one note on an accent tile.
function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <ellipse cx="10" cy="16" rx="3.4" ry="2.6" transform="rotate(-20 10 16)" fill="var(--ground)" />
      <path d="M13 15.2V6.2c2 .3 3.6 1.4 4.4 3" stroke="var(--ground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ModalOverlay({ onClose, children }: { onClose?: () => void; children: React.ReactNode }) {
  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4"
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`anim-dialog bg-surface rounded-t-[20px] sm:rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.55)] w-full ${maxW} max-h-[92vh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0`}
    >
      <div className="px-6 pt-6 pb-2 flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <h2 className="text-ink text-base font-semibold leading-6">{title}</h2>
          {subtitle && <p className="text-muted text-sm leading-5 mt-1">{subtitle}</p>}
        </div>
        <button onClick={onClose} className={`${ICON_BTN} -mr-2 -mt-1 hover:text-ink hover:bg-raised`} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 px-6 pt-2 pb-6 shrink-0">
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
  hasSaved,        // a file is already attached to this song (edit mode)
  savedFileType,   // "pdf" or "docx" — for the saved pill label
  pickedFile,      // File just chosen from disk, not yet uploaded
  onPick,
  onClearSaved,
  onClearPicked,
}: {
  idPrefix: string;
  // Whether a file is already saved on this song (true = Convex storage ID set).
  hasSaved: boolean;
  // "pdf" or "docx" — used purely to label the saved pill.
  savedFileType: "pdf" | "docx" | null;
  pickedFile: File | null;
  onPick: (f: File | null) => void;
  onClearSaved: () => void;
  onClearPicked: () => void;
}) {
  const inputId = `${idPrefix}-file`;
  const showSaved = hasSaved && !pickedFile;
  const hasPicked = !!pickedFile;
  const rowCls = "flex h-10 items-center justify-between gap-3 rounded-full bg-raised pl-4 pr-1.5 text-[13px]";
  const textBtn = `inline-flex h-7 items-center rounded-full px-3 ${TX}`;

  return (
    <div className="mt-2">
      {showSaved && (
        <div className={rowCls}>
          <span className="truncate text-ink">Saved {savedFileType ? savedFileType.toUpperCase() : "file"}</span>
          <div className="flex items-center shrink-0">
            <label htmlFor={inputId} className={`${textBtn} text-ink hover:bg-raised-hover cursor-pointer`}>
              Replace
            </label>
            <button
              type="button"
              onClick={onClearSaved}
              className={`${textBtn} text-faint hover:text-negative`}
              title="Remove file"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {hasPicked && pickedFile && (
        <div className={rowCls}>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-ink">{pickedFile.name}</span>
            <span className="text-faint shrink-0">{(pickedFile.size / 1024).toFixed(0)} KB</span>
          </span>
          <button
            type="button"
            onClick={onClearPicked}
            className={`${ICON_BTN} h-7 w-7 hover:text-negative shrink-0`}
            title="Discard"
            aria-label="Discard file"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {!hasSaved && !hasPicked && (
        <label
          htmlFor={inputId}
          className={`flex h-10 items-center justify-center rounded-full border border-dashed border-control text-[13px] text-muted hover:text-ink hover:border-muted cursor-pointer ${TX}`}
        >
          Or upload a PDF or DOCX
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
    <div className="px-6 py-4 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className={LABEL_CLS}>Title</label>
          <input
            required id="name"
            className={INPUT_CLS + (readOnlyName ? " opacity-60 cursor-not-allowed" : "")}
            value={formData.name} onChange={onChangeText}
            readOnly={readOnlyName} placeholder="10,000 Reasons"
          />
        </div>
        <div>
          <label htmlFor="key" className={LABEL_CLS}>Key</label>
          <input id="key" className={INPUT_CLS} value={formData.key} onChange={onChangeText} placeholder="G Major" />
        </div>
      </div>

      <div>
        <label htmlFor="chords" className={LABEL_CLS}>Chords</label>
        <input
          type="url" id="chords" className={INPUT_CLS}
          value={formData.chords} onChange={onChangeText} placeholder="Paste a link"
        />
        <FileSlot
          idPrefix="chords"
          hasSaved={!!formData.chordsStorageId}
          savedFileType={formData.chordsFileType}
          pickedFile={chordsFileUpload}
          onPick={onPickChordsFile}
          onClearSaved={onClearSavedChordsFile}
          onClearPicked={onClearPickedChordsFile}
        />
      </div>

      <div>
        <label htmlFor="lyrics" className={LABEL_CLS}>Lyrics</label>
        <input
          type="url" id="lyrics" className={INPUT_CLS}
          value={formData.lyrics} onChange={onChangeText} placeholder="Paste a link"
        />
        <FileSlot
          idPrefix="lyrics"
          hasSaved={!!formData.lyricsStorageId}
          savedFileType={formData.lyricsFileType}
          pickedFile={lyricsFileUpload}
          onPick={onPickLyricsFile}
          onClearSaved={onClearSavedLyricsFile}
          onClearPicked={onClearPickedLyricsFile}
        />
      </div>

      <div>
        <label htmlFor="listen" className={LABEL_CLS}>Video</label>
        <input
          type="url" id="listen" className={INPUT_CLS}
          value={formData.listen} onChange={onChangeText} placeholder="Paste a link"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="capo" className={LABEL_CLS}>Capo</label>
          <input id="capo" className={INPUT_CLS} value={formData.capo} onChange={onChangeText} placeholder="0" />
        </div>
        <div>
          <label htmlFor="bpm" className={LABEL_CLS}>BPM</label>
          <input id="bpm" className={INPUT_CLS} value={formData.bpm} onChange={onChangeText} placeholder="77" />
        </div>
        <div>
          <label htmlFor="beat" className={LABEL_CLS}>Beat</label>
          <input id="beat" className={INPUT_CLS} value={formData.beat} onChange={onChangeText} placeholder="WorshipSlow" />
        </div>
      </div>

      <fieldset>
        <legend className={LABEL_CLS}>Part of the Mass</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SONG_TYPES.map(t => (
            <label key={t} className="cursor-pointer select-none">
              <input
                type="checkbox" value={t}
                checked={formData.type.includes(t)}
                onChange={e => onTypeToggle(t, e.target.checked)}
                className="peer sr-only"
              />
              <span className={`inline-flex h-9 items-center rounded-full bg-raised px-4 text-[13px] text-muted hover:text-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-muted ${TX}`}>
                {PART_LABELS[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="notes" className={LABEL_CLS}>Notes</label>
        <textarea
          id="notes"
          className={TEXTAREA_CLS}
          value={formData.notes}
          onChange={onChangeText}
          placeholder="Arrangement, cues, who leads"
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
  // Live query — re-runs automatically whenever the `songs` table changes.
  // Returns `undefined` until the first response arrives.
  const songsResult = useQuery(api.songs.list);
  const songs = useMemo(() => (songsResult ?? []) as unknown as Song[], [songsResult]);
  const loading = songsResult === undefined;
  const [auth, setAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [search, setSearch] = useState("");
  // Part-of-the-Mass filter driven by the count cards above the table.
  const [partFilter, setPartFilter] = useState<SongType | "all">("all");
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
  // Per-slot freeze: a frozen slot keeps its current song on respin while the
  // others keep spinning. Reset whenever the lineup is opened or closed.
  const [lockedSlots, setLockedSlots] = useState<{ entrance: boolean; communion: boolean; recessional: boolean }>(
    { entrance: false, communion: false, recessional: false }
  );
  // Horizontal-scroll tracking — when the table container is scrolled right,
  // the sticky Song column becomes a "floating" label (transparent, smaller).
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableScrolled, setTableScrolled] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Convex mutations — auth token is passed per-call.
  const createSong       = useMutation(api.songs.create);
  const updateSong       = useMutation(api.songs.update);
  const removeSong       = useMutation(api.songs.remove);
  const incrementUsageMu = useMutation(api.songs.incrementUsage);

  // Restore any session-persisted auth token on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem("songchart_token");
    if (saved) {
      setAuthToken(saved);
      setAuth(true);
    }
  }, []);
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

  // Upload a file into Convex storage. Returns the storage ID, which the
  // caller persists on the song via the create/update mutation. The
  // chords/lyrics distinction lives entirely in which song field it's
  // assigned to — Convex storage doesn't care.
  const generateUploadUrlMu = useMutation(api.songs.generateUploadUrl);
  const uploadSongFile = useCallback(async (file: File, token: string): Promise<string> => {
    const uploadUrl = await generateUploadUrlMu({ token });
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}): ${text}`);
    }
    const data = await res.json() as { storageId: string };
    return data.storageId;
  }, [generateUploadUrlMu]);

  useEffect(() => {
    if (selectedSong) {
      setFormData({
        name: selectedSong.name, listen: selectedSong.listen ?? "",
        chords: selectedSong.chords, key: selectedSong.key,
        capo: selectedSong.capo, bpm: selectedSong.bpm, beat: selectedSong.beat,
        type: selectedSong.type ?? [], usage_counter: selectedSong.usage_counter ?? 0,
        lyrics: selectedSong.lyrics ?? "",
        chordsStorageId: selectedSong.chordsStorageId ?? "",
        lyricsStorageId: selectedSong.lyricsStorageId ?? "",
        chordsFileType:  selectedSong.chordsFileType ?? null,
        lyricsFileType:  selectedSong.lyricsFileType ?? null,
        notes: selectedSong.notes ?? "",
      });
    }
  }, [selectedSong]);

  // Songs matching the search box. Part counts are computed from this set so
  // they always describe what the current search can show.
  const searchMatches = useMemo(() => {
    const q = search.toLowerCase();
    return songs.filter(s => s.name.toLowerCase().includes(q));
  }, [songs, search]);

  const partCounts = useMemo(() => {
    const counts: Record<string, number> = { all: searchMatches.length };
    for (const t of SONG_TYPES) counts[t] = searchMatches.filter(s => s.type?.includes(t)).length;
    return counts;
  }, [searchMatches]);

  const filteredSongs = useMemo(() => {
    const filtered = partFilter === "all"
      ? searchMatches
      : searchMatches.filter(s => s.type?.includes(partFilter));
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc"
        ? av.localeCompare(bv, "en", { sensitivity: "base" })
        : bv.localeCompare(av, "en", { sensitivity: "base" });
    });
  }, [searchMatches, partFilter, sortKey, sortDir]);

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

  // Open chords/lyrics. If the song has both a URL and a file, show the
  // chooser modal; otherwise go straight to whichever one exists.
  const openSource = (kind: "chords" | "lyrics", song: Song) => {
    const url = kind === "chords" ? song.chords : song.lyrics;
    const fileUrl = kind === "chords" ? song.chordsFileUrl : song.lyricsFileUrl;
    if (url && fileUrl) {
      setSourceChooser({ kind, song });
    } else if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (fileUrl) {
      // Viewer page fetches a fresh signed URL from Convex on open.
      const viewUrl = `/view/${kind}/${song._id}?song=${encodeURIComponent(song.name)}`;
      window.open(viewUrl, "_blank", "noopener,noreferrer");
    }
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
      !!formData.chords.trim() || !!formData.chordsStorageId || !!chordsFileUpload;
    const hasLyrics =
      !!formData.lyrics.trim() || !!formData.lyricsStorageId || !!lyricsFileUpload;
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

      if (!authToken) throw new Error("Not signed in");

      // Upload any picked files first so the song row lands with a valid storage ID.
      let chordsStorageId: string = formData.chordsStorageId;
      let lyricsStorageId: string = formData.lyricsStorageId;
      if (chordsFileUpload) chordsStorageId = await uploadSongFile(chordsFileUpload, authToken);
      if (lyricsFileUpload) lyricsStorageId = await uploadSongFile(lyricsFileUpload, authToken);

      await createSong({
        token: authToken,
        name:            formData.name,
        listen:          formData.listen || undefined,
        chords:          formData.chords,
        key:             formData.key,
        capo:            formData.capo,
        bpm:             formData.bpm,
        beat:            formData.beat,
        type:            formData.type.length > 0 ? formData.type : undefined,
        usage_counter:   formData.usage_counter || undefined,
        lyrics:          formData.lyrics || undefined,
        chordsStorageId: (chordsStorageId as Id<"_storage">) || undefined,
        lyricsStorageId: (lyricsStorageId as Id<"_storage">) || undefined,
        notes:           formData.notes || undefined,
      });

      setShowAddModal(false);
      setFormData({ ...EMPTY_FORM });
      setChordsFileUpload(null);
      setLyricsFileUpload(null);
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

      if (!authToken) throw new Error("Not signed in");
      if (!selectedSong?._id) throw new Error("Missing song id");

      // Upload newly picked files (replaces any existing saved file — the
      // Convex update mutation deletes the old storage object).
      let chordsStorageId: string = formData.chordsStorageId;
      let lyricsStorageId: string = formData.lyricsStorageId;
      if (chordsFileUpload) chordsStorageId = await uploadSongFile(chordsFileUpload, authToken);
      if (lyricsFileUpload) lyricsStorageId = await uploadSongFile(lyricsFileUpload, authToken);

      await updateSong({
        token: authToken,
        id:              selectedSong._id as Id<"songs">,
        name:            formData.name,
        listen:          formData.listen || undefined,
        chords:          formData.chords,
        key:             formData.key,
        capo:            formData.capo,
        bpm:             formData.bpm,
        beat:            formData.beat,
        type:            formData.type.length > 0 ? formData.type : undefined,
        usage_counter:   formData.usage_counter || undefined,
        lyrics:          formData.lyrics || undefined,
        chordsStorageId: (chordsStorageId as Id<"_storage">) || undefined,
        lyricsStorageId: (lyricsStorageId as Id<"_storage">) || undefined,
        notes:           formData.notes || undefined,
      });

      setShowEditModal(false);
      setSelectedSong(null);
      setChordsFileUpload(null);
      setLyricsFileUpload(null);
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

  // respectLocks=false → fresh pick for all 3 (initial open).
  // respectLocks=true  → frozen slots keep their current song (respin).
  const generateRepertoire = (respectLocks = false) => {
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

    setRepertoire(prev => ({
      entrance:    respectLocks && lockedSlots.entrance    && prev ? prev.entrance    : weightedPick(entrancePool),
      communion:   respectLocks && lockedSlots.communion   && prev ? prev.communion   : weightedPick(communionPool),
      recessional: respectLocks && lockedSlots.recessional && prev ? prev.recessional : weightedPick(recessionalPool),
    }));
  };

  const openLineup = () => {
    setLockedSlots({ entrance: false, communion: false, recessional: false });
    setShowRepertoireModal(true);
    generateRepertoire();
  };
  const openAddSong = () => requireAuth(() => { setFormData({ ...EMPTY_FORM }); setShowAddModal(true); });

  const confirmRepertoire = async () => {
    if (!repertoire) return;
    setConfirming(true);
    try {
      if (!authToken) throw new Error("Not signed in");
      await incrementUsageMu({
        token: authToken,
        ids: [
          repertoire.entrance._id    as Id<"songs">,
          repertoire.communion._id   as Id<"songs">,
          repertoire.recessional._id as Id<"songs">,
        ],
      });
      setShowRepertoireModal(false);
      setRepertoire(null);
      setLockedSlots({ entrance: false, communion: false, recessional: false });
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
      if (!authToken) throw new Error("Not signed in");
      // TODO (step E): clean up B2 files using the returned filenames. For
      // now we accept some orphaning until file storage moves to Convex.
      await removeSong({ token: authToken, id: songToDelete._id as Id<"songs"> });
      setSongToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  };

  // ── Shell ────────────────────────────────────────────────────────────────

  const topBar = (
    <header className="sticky top-0 z-30 bg-ground border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">SongChart</span>
          <span className="hidden sm:block h-5 w-px bg-line" />
          <span className="hidden sm:block truncate text-sm text-muted">SACM Youth Choir</span>
        </div>
        {!loading && (
          <div className="flex items-center gap-2">
            {auth && (
              <>
                <button onClick={openLineup} className={`${BTN_GHOST} hidden sm:inline-flex`}>
                  Generate lineup
                </button>
                <button onClick={openLineup} className={`${BTN_GHOST} sm:hidden w-10 h-10 px-0`} aria-label="Generate lineup">
                  <Shuffle size={16} />
                </button>
              </>
            )}
            <button onClick={openAddSong} className={`${BTN_PRIMARY} hidden sm:inline-flex`}>
              Add song
            </button>
            <button onClick={openAddSong} className={`${BTN_PRIMARY} sm:hidden w-10 h-10 px-0`} aria-label="Add song">
              <Plus size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  );

  // ── Loading / Error ──────────────────────────────────────────────────────

  // Loading keeps the final layout with flat bars where the rows will land.
  if (loading) {
    return (
      <div className="min-h-screen bg-ground text-ink">
        {topBar}
        <main className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-8 pb-16" aria-busy="true">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Songs</h1>
          <div className="mt-6 rounded-[20px] bg-surface py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex h-[52px] items-center gap-8 px-5">
                <div className="h-3.5 w-48 rounded-full bg-raised" />
                <div className="hidden sm:block h-3.5 w-32 rounded-full bg-raised" />
                <div className="hidden sm:block h-3.5 w-16 rounded-full bg-raised" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  const closeAuth = () => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); };
  const countLabel = `${filteredSongs.length} ${filteredSongs.length === 1 ? "song" : "songs"}` +
    (partFilter !== "all" ? ` for ${PART_LABELS[partFilter].toLowerCase()}` : "") +
    (search ? ` matching "${search}"` : "");

  return (
    <div className="min-h-screen bg-ground text-ink">

      {/* Auth modal */}
      {showAuthModal && (
        <ModalOverlay onClose={closeAuth}>
          <ModalPanel
            title="Sign in"
            subtitle="oooopen sesame"
            size="sm"
            onClose={closeAuth}
          >
            <form onSubmit={checkAuth}>
              <div className="px-6 py-4 space-y-3">
                <div>
                  <label htmlFor="auth" className={LABEL_CLS}>Password</label>
                  <input
                    type="password" id="auth" name="auth" className={INPUT_CLS}
                    autoFocus
                  />
                </div>
                {authError && (
                  <p className={ERR_BOX}>{authError}</p>
                )}
              </div>
              <ModalFooter>
                <button type="button" onClick={closeAuth} className={BTN_GHOST}>
                  Cancel
                </button>
                <button type="submit" className={BTN_PRIMARY}>
                  Continue
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
            title={`Delete "${songToDelete.name}"?`}
            subtitle="you really wanna erase this from the database? there's no redo or ctrl+z on this one"
            size="sm"
            onClose={() => { if (!deleting) { setSongToDelete(null); setDeleteError(""); } }}
          >
            {deleteError && (
              <div className="px-6 pt-4">
                <p className={ERR_BOX}>{deleteError}</p>
              </div>
            )}
            <div className="pt-4" />
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
                {deleting ? <><Spinner /> Deleting</> : "Delete song"}
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
                onClearSavedChordsFile={() => setFormData(p => ({ ...p, chordsStorageId: "" }))}
                onClearSavedLyricsFile={() => setFormData(p => ({ ...p, lyricsStorageId: "" }))}
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
                  {submitting ? <><Spinner /> Saving</> : "Add song"}
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
            title="Edit song"
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
                onClearSavedChordsFile={() => setFormData(p => ({ ...p, chordsStorageId: "" }))}
                onClearSavedLyricsFile={() => setFormData(p => ({ ...p, lyricsStorageId: "" }))}
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
                  {submitting ? <><Spinner /> Saving</> : "Save changes"}
                </button>
              </ModalFooter>
            </form>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Repertoire modal */}
      {showRepertoireModal && (
        <ModalOverlay onClose={() => { if (!confirming) { setShowRepertoireModal(false); setRepertoire(null); setRepertoireError(""); setLockedSlots({ entrance: false, communion: false, recessional: false }); } }}>
          <ModalPanel
            title="Lineup"
            subtitle="if ur too lazy to pick songs manually ig"
            onClose={() => { if (!confirming) { setShowRepertoireModal(false); setRepertoire(null); setRepertoireError(""); setLockedSlots({ entrance: false, communion: false, recessional: false }); } }}
          >
            <div className="px-6 py-4 space-y-3">
              {repertoireError && (
                <p className={ERR_BOX}>{repertoireError}</p>
              )}
              {repertoire && (
                <ol className="space-y-2">
                  {(["entrance", "communion", "recessional"] as const).map(slot => {
                    const song = repertoire[slot];
                    const frozen = lockedSlots[slot];
                    const meta = [song.key, song.bpm && `${song.bpm} bpm`].filter(Boolean).join(" · ");
                    return (
                      <li key={slot} className="flex items-center justify-between gap-4 rounded-[14px] bg-raised py-3 pl-4 pr-3">
                        <div className="min-w-0">
                          <p className="text-xs text-faint">{PART_LABELS[slot]}</p>
                          <p className="mt-0.5 truncate text-[15px] font-medium text-ink">{song.name}</p>
                          {meta && <p className="mt-0.5 text-[13px] text-muted">{meta}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLockedSlots(l => ({ ...l, [slot]: !l[slot] }))}
                          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] ${TX} active:scale-[0.96] ${frozen ? "bg-ink text-ground" : "text-muted hover:text-ink hover:bg-raised-hover"}`}
                          title={frozen ? "Unfreeze — let this slot spin again" : "Freeze this song — keep it on respin"}
                          aria-pressed={frozen}
                        >
                          {frozen && <Lock size={12} />}
                          {frozen ? "Kept" : "Keep"}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <ModalFooter>
              <button
                type="button"
                onClick={() => generateRepertoire(true)}
                disabled={confirming}
                className={BTN_GHOST}
              >
                <Shuffle size={14} /> Respin
              </button>
              <button
                onClick={confirmRepertoire}
                disabled={confirming || !repertoire}
                className={BTN_PRIMARY}
              >
                {confirming ? <><Spinner /> Confirming</> : "Confirm lineup"}
              </button>
            </ModalFooter>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Source chooser — shown when a user clicks "open" on Chords or Lyrics */}
      {sourceChooser && (() => {
        const { kind, song } = sourceChooser;
        const url = kind === "chords" ? song.chords : song.lyrics;
        const fileUrl  = kind === "chords" ? song.chordsFileUrl  : song.lyricsFileUrl;
        const fileType = kind === "chords" ? song.chordsFileType : song.lyricsFileType;
        const label = kind === "chords" ? "Chords" : "Lyrics";
        const rowCls = `flex h-12 items-center justify-between gap-4 rounded-[14px] bg-raised px-4 text-sm text-ink hover:bg-raised-hover active:scale-[0.99] ${TX}`;
        return (
          <ModalOverlay onClose={() => setSourceChooser(null)}>
            <ModalPanel
              title={label}
              subtitle={song.name}
              size="sm"
              onClose={() => setSourceChooser(null)}
            >
              <div className="px-6 py-4 space-y-2">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowCls}
                    onClick={() => setSourceChooser(null)}
                  >
                    <span>Open link</span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-faint">
                      <span className="truncate">{hostOf(url)}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </span>
                  </a>
                ) : null}
                {fileUrl ? (
                  <a
                    href={`/view/${kind}/${song._id}?song=${encodeURIComponent(song.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSourceChooser(null)}
                    className={rowCls}
                  >
                    <span>Open file</span>
                    <span className="text-[13px] text-faint">{fileType ? fileType.toUpperCase() : ""}</span>
                  </a>
                ) : null}
                {!url && !fileUrl && (
                  <p className="text-muted text-sm">No sources available.</p>
                )}
              </div>
              <div className="pb-2" />
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
            <div className="px-6 pt-2 pb-6">
              <p className="text-ink text-sm leading-6 whitespace-pre-wrap">{notesViewer.notes || "No notes."}</p>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {topBar}

      <main className="mx-auto max-w-[1280px] px-4 sm:px-8 pt-8 pb-12">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Songs</h1>
          <div className="flex h-10 w-full items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 sm:w-80 focus-within:bg-hover transition-[background-color] duration-150">
            <Search size={16} className="text-faint shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search songs"
              aria-label="Search songs"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className={`${ICON_BTN} h-7 w-7 hover:text-ink hover:bg-raised`} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Part-of-the-Mass count cards. They are the type filter for the list. */}
        <div
          role="group"
          aria-label="Filter by part of the Mass"
          className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-[14px] sm:overflow-visible sm:px-0"
        >
          {(["all", ...SONG_TYPES] as const).map(p => {
            const selected = partFilter === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPartFilter(p)}
                aria-pressed={selected}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-left ${TX} active:scale-[0.98] sm:h-[64px] sm:flex-col sm:items-start sm:justify-center sm:gap-0.5 sm:rounded-[14px] sm:px-4 ${selected ? "border-accent bg-accent-tint" : "border-transparent bg-surface hover:bg-hover"}`}
              >
                <span className={`text-[13px] ${selected ? "text-ink" : "text-muted"}`}>
                  {p === "all" ? "All songs" : PART_LABELS[p]}
                </span>
                <span className="text-[13px] font-semibold text-ink sm:text-base">{partCounts[p]}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        {(() => {
          // Skip the sticky Song column entirely when there's only one result —
          // the user searched, narrowed to a single row, they already know which
          // song they're looking at, so the column can just scroll naturally.
          const pinSongColumn = filteredSongs.length > 1;
          const showFloatingTitle = pinSongColumn && tableScrolled;
          const openBtn = `inline-flex h-8 items-center rounded-full px-3 text-[13px] hover:bg-raised active:scale-[0.96] ${TX}`;
          return (
        <div className="hidden lg:block mt-[14px] rounded-[20px] bg-surface overflow-hidden">
        <div ref={tableWrapRef} className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((col, i) => {
                  const isFirst = i === 0;
                  const stickyCls = !isFirst || !pinSongColumn
                    ? ""
                    : showFloatingTitle
                      // Hide the "Song" header text when scrolled — floating row
                      // labels below make it redundant, and this keeps the top-left
                      // corner transparent so underlying content is visible.
                      ? "sticky left-0 z-20 bg-transparent pointer-events-none invisible"
                      : "sticky left-0 z-20 bg-surface";
                  const sortTip = col.sortable
                    ? sortKey === col.key
                      ? `Sorted by ${col.label} (${sortDir === "asc" ? "ascending" : "descending"}) — click to reverse`
                      : `Sort by ${col.label}`
                    : undefined;
                  const ariaSort = col.sortable && sortKey === col.key
                    ? (sortDir === "asc" ? "ascending" : "descending")
                    : undefined;
                  return (
                    <th
                      key={col.key}
                      aria-sort={ariaSort}
                      className={`h-11 ${isFirst ? "pl-5 pr-4" : "px-4"} ${col.numeric ? "text-right" : "text-left"} text-xs font-normal text-faint whitespace-nowrap select-none ${isFirst ? "min-w-[240px]" : ""} ${stickyCls}`}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          title={sortTip}
                          className={`inline-flex items-center gap-1 hover:text-ink ${TX} ${col.numeric ? "flex-row-reverse" : ""} ${sortKey === col.key ? "text-ink" : ""}`}
                        >
                          {col.label}
                          {sortKey === col.key && (
                            sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          )}
                        </button>
                      ) : col.label}
                    </th>
                  );
                })}
                <th className="w-24"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredSongs.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-5 py-12 text-center text-muted text-sm border-t border-rule">
                    {search ? `No songs match "${search}".` : partFilter !== "all" ? `No songs tagged ${PART_LABELS[partFilter].toLowerCase()} yet.` : "No songs yet."}
                  </td>
                </tr>
              ) : (
                filteredSongs.map(song => (
                  <tr key={song._id} className={`border-t border-rule hover:bg-hover group ${TX}`}>
                    <td
                      className={`h-[52px] whitespace-nowrap text-ink font-medium ${TX} ${
                        !pinSongColumn
                          // Single-result case: plain cell, no stickiness.
                          ? "pl-5 pr-4 text-sm"
                          : showFloatingTitle
                            // Floating label: transparent, tight left padding so it
                            // hugs the viewport edge, smaller font, subtle shadow
                            // so it stays legible over scrolled content below.
                            ? "sticky left-0 z-10 bg-transparent pointer-events-none px-2 text-xs [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_6px_rgba(0,0,0,0.7)]"
                            // Pinned solid cell when the column is naturally visible.
                            : "sticky left-0 z-10 bg-surface group-hover:bg-hover pl-5 pr-4 text-sm"
                      }`}
                    >
                      {song.name}
                    </td>
                    <td className="px-2 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="w-[76px]">
                          {(song.chords || song.chordsFileUrl) && (
                            <button type="button" onClick={e => { e.stopPropagation(); openSource("chords", song); }} className={`${openBtn} text-ink font-medium`}>
                              Chords
                            </button>
                          )}
                        </span>
                        <span className="w-[72px]">
                          {(song.lyrics || song.lyricsFileUrl) && (
                            <button type="button" onClick={e => { e.stopPropagation(); openSource("lyrics", song); }} className={`${openBtn} text-ink font-medium`}>
                              Lyrics
                            </button>
                          )}
                        </span>
                        <span className="w-[68px]">
                          {song.listen && (
                            <a href={song.listen} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={`${openBtn} text-muted hover:text-ink`}>
                              Video
                            </a>
                          )}
                        </span>
                        <span className="w-[68px]">
                          {song.notes && (
                            <button type="button" onClick={e => { e.stopPropagation(); setNotesViewer(song); }} className={`${openBtn} text-muted hover:text-ink`}>
                              Notes
                            </button>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 text-muted whitespace-nowrap">{song.key || <span className="text-faint">—</span>}</td>
                    <td className="px-4 text-right tabular-nums text-muted">{song.capo || <span className="text-faint">—</span>}</td>
                    <td className="px-4 text-right tabular-nums text-muted">{song.bpm || <span className="text-faint">—</span>}</td>
                    <td className="px-4 text-muted whitespace-nowrap">{song.beat || <span className="text-faint">—</span>}</td>
                    <td className="px-4">
                      <div className="flex gap-1">
                        {song.type && song.type.length > 0
                          ? song.type.map(t => <span key={t} className={CHIP}>{PART_LABELS[t] ?? t}</span>)
                          : <span className="text-faint">—</span>
                        }
                      </div>
                    </td>
                    <td className="pl-2 pr-4">
                      <div className={`row-actions flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 ${TX}`}>
                        <button
                          onClick={() => requireAuth(() => { setSelectedSong(song); setShowEditModal(true); })}
                          className={`${ICON_BTN} hover:text-ink hover:bg-raised`}
                          title="Edit"
                          aria-label={`Edit ${song.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => requireAuth(() => { setDeleteError(""); setSongToDelete(song); })}
                          className={`${ICON_BTN} hover:text-negative hover:bg-raised`}
                          title="Delete"
                          aria-label={`Delete ${song.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          <p className="border-t border-rule px-5 py-3 text-xs text-faint">{countLabel}</p>
        </div>
          );
        })()}

        {/* Mobile list — shown below lg, replaces the wide table. */}
        <div className="lg:hidden mt-4 sm:mt-[14px] rounded-[20px] bg-surface">
          {filteredSongs.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted text-sm">
              {search ? `No songs match "${search}".` : partFilter !== "all" ? `No songs tagged ${PART_LABELS[partFilter].toLowerCase()} yet.` : "No songs yet."}
            </div>
          ) : (
            <ul>
              {filteredSongs.map((song, i) => {
                const hasChords = !!(song.chords || song.chordsFileUrl);
                const hasLyrics = !!(song.lyrics || song.lyricsFileUrl);
                const meta = [
                  song.key,
                  song.capo && `Capo ${song.capo}`,
                  song.bpm && `${song.bpm} bpm`,
                  song.beat,
                ].filter(Boolean).join(" · ");

                const cardBtn =
                  `inline-flex h-10 items-center justify-center rounded-full bg-raised px-4 text-[13px] active:scale-[0.96] ${TX}`;

                return (
                  <li key={song._id} className={`px-4 py-4 ${i > 0 ? "border-t border-rule" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 break-words pt-1 text-[15px] font-medium leading-6 text-ink">{song.name}</p>
                      <div className="-mr-2 flex shrink-0">
                        <button
                          type="button"
                          onClick={() => requireAuth(() => { setSelectedSong(song); setShowEditModal(true); })}
                          className={`${ICON_BTN} h-10 w-10`}
                          aria-label={`Edit ${song.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => requireAuth(() => { setDeleteError(""); setSongToDelete(song); })}
                          className={`${ICON_BTN} h-10 w-10`}
                          aria-label={`Delete ${song.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {(meta || (song.type && song.type.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {song.type?.map(t => <span key={t} className={CHIP}>{PART_LABELS[t] ?? t}</span>)}
                        {meta && <p className="text-[13px] text-muted">{meta}</p>}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {hasChords && (
                        <button type="button" onClick={() => openSource("chords", song)} className={`${cardBtn} text-ink font-medium`}>
                          Chords
                        </button>
                      )}
                      {hasLyrics && (
                        <button type="button" onClick={() => openSource("lyrics", song)} className={`${cardBtn} text-ink font-medium`}>
                          Lyrics
                        </button>
                      )}
                      {song.listen && (
                        <a href={song.listen} target="_blank" rel="noopener noreferrer" className={`${cardBtn} text-muted`}>
                          Video
                        </a>
                      )}
                      {song.notes && (
                        <button type="button" onClick={() => setNotesViewer(song)} className={`${cardBtn} text-muted`}>
                          Notes
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-rule px-4 py-3 text-xs text-faint">{countLabel}</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-[1280px] px-4 sm:px-8 pb-10">
        <p className="text-xs text-faint">
          made by{" "}
          <span
            className="relative inline-block"
            onMouseEnter={() => setShowCredits(true)}
            onMouseLeave={() => setShowCredits(false)}
          >
            {/* Speech bubble — pointer-events-none so it never intercepts clicks
                on table rows above, and vanishes instantly when the cursor
                leaves the "john mannully" text. */}
            {showCredits && (
              <span className="anim-overlay absolute bottom-full left-0 mb-2 w-64 pointer-events-none">
                <span className="block rounded-[14px] bg-raised px-3.5 py-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                  <span className="block text-xs leading-5 text-muted">
                    ZERO contributions of ANY sort were made by the following individuals:
                  </span>
                  <span className="mt-1.5 block space-y-0.5 text-xs">
                    <a href="https://www.linkedin.com/in/anvin-siby-6004a1310/" target="_blank" rel="noopener noreferrer" className="block text-ink underline underline-offset-2">
                      anvin siby
                    </a>
                    <a href="https://www.linkedin.com/in/joel-joseph-369399344/" target="_blank" rel="noopener noreferrer" className="block text-ink underline underline-offset-2">
                      joel joseph
                    </a>
                  </span>
                </span>
              </span>
            )}
            <span className="cursor-default text-muted">john mannully</span>
          </span>
          {" "}for the SACM youth choir
        </p>
      </footer>

    </div>
  );
}
