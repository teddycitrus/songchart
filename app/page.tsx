"use client"

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, ExternalLink, Lock,
  Pencil, Plus, Search, Shuffle, Trash2, X
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

// Shared input class — rounded-md, focus ring 1px (subtle)
const INPUT_CLS =
  "mt-1 w-full rounded-md border border-[#e4e4e7] px-3 py-2 text-sm text-[#18181b] " +
  "placeholder:text-[#a1a1aa] focus:outline-none focus:ring-1 focus:ring-[#18181b] " +
  "focus:border-[#18181b] transition-[border-color,box-shadow] duration-150 ease-in-out";

// Shared button classes
const BTN_GHOST =
  `px-4 py-2 text-sm font-medium rounded-md border border-[#e4e4e7] text-[#18181b] ${TX} hover:bg-[#f4f4f5]`;
const BTN_PRIMARY =
  `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-[#18181b] text-white ${TX} hover:bg-[#27272a] disabled:opacity-40 disabled:cursor-not-allowed`;
const BTN_DANGER =
  `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white ${TX} hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed`;

const COLUMNS: { key: keyof Song; label: string; sortable: boolean }[] = [
  { key: "name",      label: "Song",      sortable: true  },
  { key: "chords",    label: "Chords",    sortable: false },
  { key: "key",       label: "Key",       sortable: true  },
  { key: "transpose", label: "Transpose", sortable: true  },
  { key: "capo",      label: "Capo",      sortable: true  },
  { key: "bpm",       label: "BPM",       sortable: true  },
  { key: "beat",      label: "Beat",      sortable: true  },
  { key: "type",      label: "Type",      sortable: false },
];

const EMPTY_FORM = {
  name: "", chords: "", key: "", transpose: "",
  capo: "", bpm: "", beat: "",
  type: [] as string[],
  usage_counter: 0,
};

type FormData = typeof EMPTY_FORM;

// ── Shared primitives ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
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
    <div className={`bg-white rounded-t-lg sm:rounded-lg shadow-lg w-full ${maxW} mx-0 sm:mx-4 max-h-[92vh] flex flex-col`}>
      <div className="px-6 pt-5 pb-4 border-b border-[#e4e4e7] flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-[#18181b] text-base font-semibold leading-snug">{title}</h2>
          {subtitle && <p className="text-[#71717a] text-sm mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className={`ml-4 p-1 rounded-md text-[#71717a] hover:text-[#18181b] ${TX}`} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e4e4e7] shrink-0">
      {children}
    </div>
  );
}

// ── SongFormBody ───────────────────────────────────────────────────────────

function SongFormBody({
  formData,
  readOnlyName,
  submitError,
  onChangeText,
  onTypeToggle,
}: {
  formData: FormData;
  readOnlyName?: boolean;
  submitError: string;
  onChangeText: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTypeToggle: (t: string, checked: boolean) => void;
}) {
  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[#18181b] text-sm font-medium">
            Title<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            required id="name"
            className={INPUT_CLS + (readOnlyName ? " bg-[#f4f4f5] cursor-not-allowed" : "")}
            value={formData.name} onChange={onChangeText}
            readOnly={readOnlyName} placeholder="10,000 Reasons"
          />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">Key</label>
          <input id="key" className={INPUT_CLS} value={formData.key} onChange={onChangeText} placeholder="G Major" />
        </div>
      </div>

      <div>
        <label className="text-[#18181b] text-sm font-medium">
          Chords / Lyrics URL<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          required type="url" id="chords" className={INPUT_CLS}
          value={formData.chords} onChange={onChangeText} placeholder="https://..."
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[#18181b] text-sm font-medium">Transpose</label>
          <input id="transpose" className={INPUT_CLS} value={formData.transpose} onChange={onChangeText} placeholder="0" />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">Capo</label>
          <input id="capo" className={INPUT_CLS} value={formData.capo} onChange={onChangeText} placeholder="0" />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">BPM</label>
          <input id="bpm" className={INPUT_CLS} value={formData.bpm} onChange={onChangeText} placeholder="77" />
        </div>
      </div>

      <div>
        <label className="text-[#18181b] text-sm font-medium">Beat</label>
        <input id="beat" className={INPUT_CLS} value={formData.beat} onChange={onChangeText} placeholder="4/4" />
      </div>

      <div>
        <p className="text-[#18181b] text-sm font-medium mb-2">Type</p>
        <div className="flex flex-wrap gap-2">
          {SONG_TYPES.map(t => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox" value={t}
                checked={formData.type.includes(t)}
                onChange={e => onTypeToggle(t, e.target.checked)}
                className="rounded-sm accent-[#18181b]"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_PILLS[t]}`}>{t}</span>
            </label>
          ))}
        </div>
      </div>

      {submitError && (
        <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-md px-3 py-2">{submitError}</p>
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
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showRepertoireModal, setShowRepertoireModal] = useState(false);
  const [repertoire, setRepertoire] = useState<{ entrance: Song; communion: Song; recessional: Song } | null>(null);
  const [repertoireError, setRepertoireError] = useState("");
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

  useEffect(() => {
    if (selectedSong) {
      setFormData({
        name: selectedSong.name, chords: selectedSong.chords,
        key: selectedSong.key, transpose: selectedSong.transpose,
        capo: selectedSong.capo, bpm: selectedSong.bpm, beat: selectedSong.beat,
        type: selectedSong.type ?? [], usage_counter: selectedSong.usage_counter ?? 0,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
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
    const data = await res.json();
    if (data.ok) {
      setAuth(true);
      setAuthError("");
      setShowAuthModal(false);
      if (pendingAction) { pendingAction(); setPendingAction(null); }
    } else {
      setAuthError("Incorrect password.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to add song");
      setShowAddModal(false);
      setFormData({ ...EMPTY_FORM });
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
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, _id: selectedSong?._id }),
      });
      if (!res.ok) throw new Error("Failed to update song");
      setShowEditModal(false);
      setSelectedSong(null);
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
      const res = await fetch("/api/increment-usage", {
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
      const res = await fetch("/api/delete", {
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
            title="Sign in"
            subtitle="Enter the admin password to continue."
            size="sm"
            onClose={() => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); }}
          >
            <form onSubmit={checkAuth}>
              <div className="px-6 py-5 space-y-3">
                <div>
                  <label className="text-[#18181b] text-sm font-medium">Password</label>
                  <input
                    type="password" name="auth" className={INPUT_CLS}
                    placeholder="Password" autoFocus
                  />
                </div>
                {authError && (
                  <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-md px-3 py-2">{authError}</p>
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
            title="Delete song"
            subtitle={`This will permanently remove "${songToDelete.name}" from the database.`}
            size="sm"
            onClose={() => { if (!deleting) { setSongToDelete(null); setDeleteError(""); } }}
          >
            <div className="px-6 py-5">
              {deleteError && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-md px-3 py-2">{deleteError}</p>
              )}
            </div>
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
        <ModalOverlay onClose={() => { if (!submitting) { setShowAddModal(false); setSubmitError(""); } }}>
          <ModalPanel
            title="Add song"
            onClose={() => { if (!submitting) { setShowAddModal(false); setSubmitError(""); } }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col">
              <SongFormBody
                formData={formData} submitError={submitError}
                onChangeText={handleChange} onTypeToggle={handleTypeToggle}
              />
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setSubmitError(""); }}
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
        <ModalOverlay onClose={() => { if (!submitting) { setShowEditModal(false); setSelectedSong(null); setSubmitError(""); } }}>
          <ModalPanel
            title="Edit song"
            subtitle={selectedSong.name}
            onClose={() => { if (!submitting) { setShowEditModal(false); setSelectedSong(null); setSubmitError(""); } }}
          >
            <form onSubmit={handleUpdate} className="flex flex-col">
              <SongFormBody
                formData={formData} readOnlyName submitError={submitError}
                onChangeText={handleChange} onTypeToggle={handleTypeToggle}
              />
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedSong(null); setSubmitError(""); }}
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
                <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-md px-3 py-2">{repertoireError}</p>
              )}
              {repertoire && (
                <div className="space-y-2">
                  {(["entrance", "communion", "recessional"] as const).map(slot => {
                    const song = repertoire[slot];
                    return (
                      <div key={slot} className="flex items-center justify-between rounded-md border border-[#e4e4e7] px-4 py-3">
                        <div>
                          <p className="text-[#18181b] text-sm font-medium">{song.name}</p>
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
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border border-[#e4e4e7] text-[#18181b] ${TX} hover:bg-[#f4f4f5] disabled:opacity-40`}
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

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
        <h1 className="text-white text-sm font-semibold tracking-tight">SongChart</h1>
        <p className="text-white text-sm tracking-tight">made by john mannully for the SACM Youth Choir</p>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#262626]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable ? toggleSort(col.key) : undefined}
                  className={`px-4 py-3 text-left text-xs font-medium text-[#71717a] whitespace-nowrap select-none ${col.sortable ? `cursor-pointer hover:text-[#a1a1aa] ${TX}` : ""}`}
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
              ))}
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
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{song.name}</td>
                  <td className="px-4 py-3">
                    {song.chords ? (
                      <a
                        href={song.chords} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-xs text-[#71717a] hover:text-[#a1a1aa] ${TX}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={12} /> open
                      </a>
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

    </div>
  );
}
