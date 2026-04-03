"use client"

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, ExternalLink, Lock,
  Pencil, Plus, Search, Trash2, X
} from "lucide-react";
import { Song } from "../types/Song";

// Full literal strings required so Tailwind JIT doesn't purge them
const TYPE_PILLS: Record<string, string> = {
  entrance:    "bg-blue-500 text-white",
  communion:   "bg-violet-500 text-white",
  recessional: "bg-amber-500 text-white",
  misc:        "bg-zinc-500 text-white",
};

const SONG_TYPES = ["entrance", "communion", "recessional", "misc"] as const;

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-sm text-[#18181b] placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#18181b]";

const COLUMNS: { key: keyof Song; label: string }[] = [
  { key: "name",      label: "Song" },
  { key: "chords",    label: "Chords" },
  { key: "key",       label: "Key" },
  { key: "transpose", label: "Transpose" },
  { key: "capo",      label: "Capo" },
  { key: "bpm",       label: "BPM" },
  { key: "beat",      label: "Beat" },
  { key: "type",      label: "Type" },
];

const EMPTY_FORM = {
  name: "", chords: "", key: "", transpose: "",
  capo: "", bpm: "", beat: "",
  type: [] as string[],
  usage_counter: 0,
};

type FormData = typeof EMPTY_FORM;

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
      {/* Row 1: Title + Key */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[#18181b] text-sm font-medium">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            required
            id="name"
            className={INPUT_CLASS + (readOnlyName ? " bg-gray-100 cursor-not-allowed" : "")}
            value={formData.name}
            onChange={onChangeText}
            readOnly={readOnlyName}
            placeholder="10,000 Reasons"
          />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">Key</label>
          <input
            id="key"
            className={INPUT_CLASS}
            value={formData.key}
            onChange={onChangeText}
            placeholder="G Major"
          />
        </div>
      </div>

      {/* Row 2: Chords URL (full width) */}
      <div>
        <label className="text-[#18181b] text-sm font-medium">
          Chords / Lyrics URL <span className="text-red-500">*</span>
        </label>
        <input
          required
          type="url"
          id="chords"
          className={INPUT_CLASS}
          value={formData.chords}
          onChange={onChangeText}
          placeholder="https://..."
        />
      </div>

      {/* Row 3: Transpose, Capo, BPM */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[#18181b] text-sm font-medium">Transpose</label>
          <input
            id="transpose"
            className={INPUT_CLASS}
            value={formData.transpose}
            onChange={onChangeText}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">Capo</label>
          <input
            id="capo"
            className={INPUT_CLASS}
            value={formData.capo}
            onChange={onChangeText}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-[#18181b] text-sm font-medium">BPM</label>
          <input
            id="bpm"
            className={INPUT_CLASS}
            value={formData.bpm}
            onChange={onChangeText}
            placeholder="77"
          />
        </div>
      </div>

      {/* Row 4: Beat (full width) */}
      <div>
        <label className="text-[#18181b] text-sm font-medium">Beat</label>
        <input
          id="beat"
          className={INPUT_CLASS}
          value={formData.beat}
          onChange={onChangeText}
          placeholder="4/4"
        />
      </div>

      {/* Row 5: Type checkboxes */}
      <div>
        <label className="text-[#18181b] text-sm font-medium block mb-2">Type</label>
        <div className="flex flex-wrap gap-3">
          {SONG_TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                value={t}
                checked={formData.type.includes(t)}
                onChange={e => onTypeToggle(t, e.target.checked)}
                className="rounded accent-[#18181b]"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_PILLS[t]}`}>
                {t}
              </span>
            </label>
          ))}
        </div>
      </div>

      {submitError && <p className="text-red-500 text-sm">{submitError}</p>}
    </div>
  );
}

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
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Sync formData when a song is selected for editing
  useEffect(() => {
    if (selectedSong) {
      setFormData({
        name:          selectedSong.name,
        chords:        selectedSong.chords,
        key:           selectedSong.key,
        transpose:     selectedSong.transpose,
        capo:          selectedSong.capo,
        bpm:           selectedSong.bpm,
        beat:          selectedSong.beat,
        type:          selectedSong.type ?? [],
        usage_counter: selectedSong.usage_counter ?? 0,
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
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleTypeToggle = (t: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      type: checked ? [...prev.type, t] : prev.type.filter(x => x !== t),
    }));
  };

  // Show auth modal if not authed, otherwise run action immediately
  const requireAuth = (action: () => void) => {
    if (auth) {
      action();
    } else {
      setPendingAction(() => action);
      setShowAuthModal(true);
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
    const data = await res.json();
    if (data.ok) {
      setAuth(true);
      setAuthError("");
      setShowAuthModal(false);
      // Run whatever action triggered the auth prompt
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      setAuthError("Incorrect password.");
    }
  };

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.name}"?`)) return;
    setDeletingId(song._id);
    try {
      const res = await fetch("/api/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: song._id }),
      });
      if (!res.ok) throw new Error("Failed to delete song");
      await fetchSongs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
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

  // ─── Loading / Error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="w-6 h-6 border-2 border-[#262626] border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* ── Auth modal (on-demand) ─────────────────────────────────────── */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={18} className="text-[#18181b]" />
              <h2 className="text-[#18181b] text-lg font-semibold">Admin Sign In</h2>
            </div>
            <p className="text-[#71717a] text-sm mb-5">Enter the password to manage songs.</p>
            <form onSubmit={checkAuth} className="space-y-3">
              <input
                type="password"
                name="auth"
                className={INPUT_CLASS}
                placeholder="Password"
                autoFocus
              />
              {authError && <p className="text-red-500 text-sm">{authError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAuthModal(false); setAuthError(""); setPendingAction(null); }}
                  className="flex-1 border border-[#e4e4e7] text-[#18181b] rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#18181b] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#27272a] transition-colors"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between">
        <h1 className="text-white font-semibold text-base">Song Database</h1>
        <div className="flex gap-2">
          <button
            onClick={() => requireAuth(() => { setFormData({ ...EMPTY_FORM }); setShowAddModal(true); })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#141414] border border-[#262626] text-white rounded-lg hover:bg-[#1f1f1f] transition-colors"
          >
            <Plus size={13} /> Add Song
          </button>
          {!auth && (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#71717a] hover:text-white transition-colors"
            >
              <Lock size={13} /> Sign in
            </button>
          )}
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-[#262626] flex items-center gap-2">
        <Search size={15} className="text-[#71717a] shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search songs..."
          className="bg-transparent text-sm text-white placeholder:text-[#71717a] outline-none flex-1"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-[#71717a] hover:text-white transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#262626]">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.key !== "type" && col.key !== "chords" ? toggleSort(col.key) : undefined}
                  className={`px-4 py-3 text-left font-medium text-[#71717a] whitespace-nowrap select-none ${col.key !== "type" && col.key !== "chords" ? "cursor-pointer hover:text-white transition-colors" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === "asc"
                        ? <ChevronUp size={12} className="text-white" />
                        : <ChevronDown size={12} className="text-white" />
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
                <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-[#71717a]">
                  {search ? `No songs matching "${search}"` : "No songs yet."}
                </td>
              </tr>
            ) : (
              filteredSongs.map(song => (
                <tr key={song._id} className="border-b border-[#262626] hover:bg-[#141414] transition-colors group">
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{song.name}</td>
                  <td className="px-4 py-3">
                    {song.chords ? (
                      <a
                        href={song.chords}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={12} /> chords
                      </a>
                    ) : (
                      <span className="text-[#71717a]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#71717a]">{song.key || "—"}</td>
                  <td className="px-4 py-3 text-[#71717a]">{song.transpose || "—"}</td>
                  <td className="px-4 py-3 text-[#71717a]">{song.capo || "—"}</td>
                  <td className="px-4 py-3 text-[#71717a]">{song.bpm || "—"}</td>
                  <td className="px-4 py-3 text-[#71717a]">{song.beat || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {song.type && song.type.length > 0
                        ? song.type.map(t => (
                            <span
                              key={t}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_PILLS[t] ?? "bg-zinc-700 text-white"}`}
                            >
                              {t}
                            </span>
                          ))
                        : <span className="text-[#71717a]">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => requireAuth(() => { setSelectedSong(song); setShowEditModal(true); })}
                        className="text-[#71717a] hover:text-white p-1 rounded transition-colors"
                        title="Edit song"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => requireAuth(() => handleDelete(song))}
                        disabled={deletingId === song._id}
                        className="text-[#71717a] hover:text-red-400 p-1 rounded transition-colors disabled:opacity-50"
                        title="Delete song"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#262626]">
              <td colSpan={COLUMNS.length + 1} className="px-4 py-2 text-[#71717a] text-xs">
                {filteredSongs.length} song{filteredSongs.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : " total"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Add song modal ─────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-[#e4e4e7]">
              <h2 className="text-[#18181b] text-lg font-semibold">Add Song</h2>
            </div>
            <form onSubmit={handleSubmit}>
              <SongFormBody
                formData={formData}
                submitError={submitError}
                onChangeText={handleChange}
                onTypeToggle={handleTypeToggle}
              />
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#e4e4e7]">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setSubmitError(""); }}
                  className="px-4 py-2 text-sm font-medium border border-[#e4e4e7] rounded-lg text-[#18181b] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-[#18181b] text-white rounded-lg hover:bg-[#27272a] disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving..." : "Add Song"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit song modal ────────────────────────────────────────────── */}
      {showEditModal && selectedSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-[#e4e4e7]">
              <h2 className="text-[#18181b] text-lg font-semibold">Edit Song</h2>
              <p className="text-[#71717a] text-sm mt-0.5">Update the details for this song.</p>
            </div>
            <form onSubmit={handleUpdate}>
              <SongFormBody
                formData={formData}
                readOnlyName
                submitError={submitError}
                onChangeText={handleChange}
                onTypeToggle={handleTypeToggle}
              />
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#e4e4e7]">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedSong(null); setSubmitError(""); }}
                  className="px-4 py-2 text-sm font-medium border border-[#e4e4e7] rounded-lg text-[#18181b] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-[#18181b] text-white rounded-lg hover:bg-[#27272a] disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
