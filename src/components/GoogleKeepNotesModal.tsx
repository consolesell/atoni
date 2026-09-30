import React, { useState, useEffect } from 'react';
import {
  FileText,
  Pin,
  CheckSquare,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Search,
  CheckCircle2,
  X,
  Copy,
  Tag,
  Palette,
  Edit3,
  AlertTriangle,
  FolderPlus,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { TradingNote, NoteColor, NOTE_COLOR_CLASSES, NoteChecklistItem } from '../types/notes';
import {
  loadLocalNotes,
  saveLocalNotes,
  fetchFirestoreNotes,
  persistNote,
  deleteFirestoreNote,
  getGoogleKeepUrl,
} from '../lib/notesEngine';
import { useAuth } from '../context/AuthContext';
import { sound } from '../lib/soundEngine';
import { createTradingReportDoc } from '../lib/googleDocs';

interface GoogleKeepNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol?: string;
  currentRegime?: string;
  currentPrice?: number;
}

export const GoogleKeepNotesModal: React.FC<GoogleKeepNotesModalProps> = ({
  isOpen,
  onClose,
  currentSymbol = '1HZ10V',
  currentRegime = 'TRENDING',
  currentPrice = 1000,
}) => {
  const { user, googleAccessToken } = useAuth();

  const [notes, setNotes] = useState<TradingNote[]>(() => loadLocalNotes());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Note creation / editing state
  const [isCreating, setIsCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [colorInput, setColorInput] = useState<NoteColor>('default');
  const [isPinnedInput, setIsPinnedInput] = useState(false);
  const [tagsInput, setTagsInput] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [isChecklistMode, setIsChecklistMode] = useState(false);
  const [checklistItems, setChecklistItems] = useState<NoteChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  // Confirmation dialog for note deletion (mandatory per Workspace skill)
  const [noteToDelete, setNoteToDelete] = useState<TradingNote | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingDocId, setExportingDocId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Sync with Firestore if authenticated
  useEffect(() => {
    if (isOpen && user) {
      fetchFirestoreNotes(user.uid).then((cloudNotes) => {
        if (cloudNotes && cloudNotes.length > 0) {
          setNotes(cloudNotes);
          saveLocalNotes(cloudNotes);
        }
      });
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSaveNote = async () => {
    if (!titleInput.trim() && !contentInput.trim() && checklistItems.length === 0) {
      handleCancelEdit();
      return;
    }

    const noteId = editingNoteId || `note-${Date.now()}`;
    const newNote: TradingNote = {
      id: noteId,
      uid: user?.uid,
      title: titleInput.trim() || 'Untitled Note',
      content: contentInput.trim(),
      color: colorInput,
      isPinned: isPinnedInput,
      tags: tagsInput,
      checklist: isChecklistMode ? checklistItems : undefined,
      createdAt: editingNoteId
        ? notes.find((n) => n.id === editingNoteId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symbol: currentSymbol,
      marketRegime: currentRegime,
    };

    const nextNotes = editingNoteId
      ? notes.map((n) => (n.id === editingNoteId ? newNote : n))
      : [newNote, ...notes];

    setNotes(nextNotes);
    saveLocalNotes(nextNotes);
    await persistNote(newNote, user?.uid);

    sound.play('click');
    handleCancelEdit();
    showNotice(editingNoteId ? 'Note updated successfully' : 'New note created');
  };

  const handleCancelEdit = () => {
    setIsCreating(false);
    setEditingNoteId(null);
    setTitleInput('');
    setContentInput('');
    setColorInput('default');
    setIsPinnedInput(false);
    setTagsInput([]);
    setTagDraft('');
    setIsChecklistMode(false);
    setChecklistItems([]);
    setNewChecklistText('');
  };

  const handleStartEdit = (note: TradingNote) => {
    setEditingNoteId(note.id);
    setIsCreating(true);
    setTitleInput(note.title);
    setContentInput(note.content);
    setColorInput(note.color);
    setIsPinnedInput(note.isPinned);
    setTagsInput(note.tags || []);
    if (note.checklist && note.checklist.length > 0) {
      setIsChecklistMode(true);
      setChecklistItems([...note.checklist]);
    } else {
      setIsChecklistMode(false);
      setChecklistItems([]);
    }
  };

  const handleTogglePin = async (note: TradingNote, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated: TradingNote = { ...note, isPinned: !note.isPinned, updatedAt: new Date().toISOString() };
    const next = notes.map((n) => (n.id === note.id ? updated : n));
    setNotes(next);
    saveLocalNotes(next);
    await persistNote(updated, user?.uid);
    sound.play('toggle');
  };

  const handleChangeNoteColor = async (note: TradingNote, color: NoteColor, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated: TradingNote = { ...note, color, updatedAt: new Date().toISOString() };
    const next = notes.map((n) => (n.id === note.id ? updated : n));
    setNotes(next);
    saveLocalNotes(next);
    await persistNote(updated, user?.uid);
  };

  const handleToggleChecklistItem = async (note: TradingNote, itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!note.checklist) return;
    const updatedChecklist = note.checklist.map((it) =>
      it.id === itemId ? { ...it, checked: !it.checked } : it
    );
    const updated: TradingNote = { ...note, checklist: updatedChecklist, updatedAt: new Date().toISOString() };
    const next = notes.map((n) => (n.id === note.id ? updated : n));
    setNotes(next);
    saveLocalNotes(next);
    await persistNote(updated, user?.uid);
    sound.play('click');
  };

  const handleDeleteConfirmed = async () => {
    if (!noteToDelete) return;
    const noteId = noteToDelete.id;
    const next = notes.filter((n) => n.id !== noteId);
    setNotes(next);
    saveLocalNotes(next);
    await deleteFirestoreNote(noteId);
    setNoteToDelete(null);
    sound.play('click');
    showNotice('Note permanently removed.');
  };

  const handleCopyNoteContent = (note: TradingNote, e: React.MouseEvent) => {
    e.stopPropagation();
    let text = `${note.title}\n\n${note.content}`;
    if (note.checklist && note.checklist.length > 0) {
      text += '\n\nChecklist:\n' + note.checklist.map((c) => `[${c.checked ? 'x' : ' '}] ${c.text}`).join('\n');
    }
    navigator.clipboard.writeText(text);
    setCopiedId(note.id);
    sound.play('click');
    setTimeout(() => setCopiedId(null), 2000);
    showNotice('Note content copied to clipboard.');
  };

  const handleOpenInGoogleKeep = (note: TradingNote, e: React.MouseEvent) => {
    e.stopPropagation();
    let text = `${note.title}\n\n${note.content}`;
    if (note.checklist && note.checklist.length > 0) {
      text += '\n\nChecklist:\n' + note.checklist.map((c) => `[${c.checked ? 'x' : ' '}] ${c.text}`).join('\n');
    }
    navigator.clipboard.writeText(text);
    try {
      window.open(getGoogleKeepUrl(), '_blank', 'noopener,noreferrer');
    } catch {
      // Ignored if window.open is restricted in iframe
    }
    sound.play('click');
    showNotice('Note copied to clipboard. Opening Google Keep in a new tab.');
  };

  const handleExportToGoogleDocs = async (note: TradingNote, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!googleAccessToken) {
      showNotice('Please connect your Google Workspace account via the Google Docs button in the header.');
      return;
    }

    setExportingDocId(note.id);
    try {
      let docBody = note.content;
      if (note.checklist && note.checklist.length > 0) {
        docBody += '\n\nChecklist Items:\n' + note.checklist.map((c) => `• [${c.checked ? 'COMPLETED' : 'PENDING'}] ${c.text}`).join('\n');
      }

      const res = await createTradingReportDoc(
        googleAccessToken,
        {
          symbol: note.symbol || currentSymbol,
          currentPrice,
          granularity: 60,
          indicators: null,
          decision: null,
          aiPrediction: null,
          openTrades: [],
          tradeHistory: [],
          accountMode: 'DEMO',
          balance: 10,
          currency: 'USD',
        },
        `Trading Note: ${note.title}`
      );

      sound.play('win');
      try {
        window.open(res.webViewLink, '_blank', 'noopener,noreferrer');
      } catch {
        // Ignored if window.open is restricted in iframe
      }
      showNotice(`Successfully exported note to Google Docs!`);
    } catch (err: any) {
      showNotice(`Export failed: ${err.message}`);
    } finally {
      setExportingDocId(null);
    }
  };

  const handleGenerateAINote = () => {
    const aiTitle = `⚡ ${currentSymbol} Tactical Execution Plan (${new Date().toLocaleTimeString()})`;
    const aiContent = `• Asset: ${currentSymbol} @ $${currentPrice.toFixed(2)}\n• Regime: ${currentRegime}\n• Target Strategy: Ensure higher timeframe trend confluence before placing orders.\n• Profit Lock: Secure 50% threshold on contracts.\n• Invalidation: Exit immediately if price breaks past volatility band.`;
    
    setTitleInput(aiTitle);
    setContentInput(aiContent);
    setColorInput('cyan');
    setIsPinnedInput(true);
    setTagsInput(['ai_plan', currentSymbol.toLowerCase(), 'strategy']);
    setIsCreating(true);
    sound.play('win');
  };

  const handleAddTag = () => {
    const trimmed = tagDraft.trim().replace(/^#/, '');
    if (trimmed && !tagsInput.includes(trimmed)) {
      setTagsInput([...tagsInput, trimmed]);
      setTagDraft('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsInput(tagsInput.filter((t) => t !== tagToRemove));
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setChecklistItems([
      ...checklistItems,
      { id: `c-${Date.now()}-${Math.random()}`, text: newChecklistText.trim(), checked: false },
    ]);
    setNewChecklistText('');
  };

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 4000);
  };

  // Filter notes
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || [])));
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      !searchQuery ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.tags && note.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))) ||
      (note.checklist && note.checklist.some((c) => c.text.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesTag = !selectedTag || (note.tags && note.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.isPinned);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header: Google Keep Branding & Controls */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/20">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5 font-sans">
                  <span>Google Keep Trading Journal</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono font-bold">
                    PRO
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Capture disciplines, checklists, and AI memos with direct Google Keep integration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateAINote}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all active:scale-95 shadow-sm shadow-cyan-500/20"
              title="Draft an automated AI strategy memo for the current asset"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Draft Note</span>
            </button>

            <a
              href={getGoogleKeepUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold transition-all"
              title="Launch Google Keep Web"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Keep</span>
            </a>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
              aria-label="Close notes modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Notice Toast */}
        {statusNotice && (
          <div className="bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs font-mono text-amber-300 animate-slide-up">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button onClick={() => setStatusNotice(null)} className="text-amber-400 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Search & Tag Filter Bar */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search trading notes, checklists, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono"
            />
          </div>

          {/* Quick Tag Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-[11px] font-mono scrollbar-none">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-1 rounded-lg border transition-all ${
                selectedTag === null
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              All ({notes.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-1 rounded-lg border transition-all whitespace-nowrap ${
                  selectedTag === tag
                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {/* Quick Take A Note Bar (Keep Style) */}
          <div className="max-w-2xl mx-auto">
            {!isCreating ? (
              <div
                onClick={() => setIsCreating(true)}
                className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 shadow-xl flex items-center justify-between cursor-text transition-all"
              >
                <span className="text-xs sm:text-sm text-slate-400 font-mono">Take a trading note or checklist...</span>
                <div className="flex items-center gap-2 text-slate-400">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsChecklistMode(true);
                      setIsCreating(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-amber-400 transition-all"
                    title="New Checklist"
                  >
                    <CheckSquare className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateAINote();
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-cyan-400 transition-all"
                    title="AI Trade Plan"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-4 shadow-2xl space-y-3 transition-all">
                {/* Title & Pin Toggle */}
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Title"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    className="w-full bg-transparent text-sm sm:text-base font-bold text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setIsPinnedInput(!isPinnedInput)}
                    className={`p-1.5 rounded-lg transition-all ${
                      isPinnedInput ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={isPinnedInput ? 'Unpin note' : 'Pin note'}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                </div>

                {/* Content Input or Checklist Mode */}
                {!isChecklistMode ? (
                  <textarea
                    rows={4}
                    placeholder="Take a note..."
                    value={contentInput}
                    onChange={(e) => setContentInput(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none font-mono leading-relaxed"
                  />
                ) : (
                  <div className="space-y-2">
                    {checklistItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2 text-xs font-mono">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => {
                            const updated = checklistItems.map((c, i) => (i === idx ? { ...c, checked: !c.checked } : c));
                            setChecklistItems(updated);
                          }}
                          className="accent-amber-500 rounded"
                        />
                        <span className={`flex-1 ${item.checked ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                          {item.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <Plus className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="List item..."
                        value={newChecklistText}
                        onChange={(e) => setNewChecklistText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddChecklistItem();
                          }
                        }}
                        className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddChecklistItem}
                        className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Tag Pills */}
                {tagsInput.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tagsInput.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        <span>#{t}</span>
                        <button type="button" onClick={() => handleRemoveTag(t)} className="hover:text-rose-400">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom Bar: Palette, Checklist Toggle, Tag Input & Save */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Color Swatches */}
                    <div className="flex items-center gap-1">
                      {(['default', 'amber', 'emerald', 'cyan', 'rose', 'purple', 'blue'] as NoteColor[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColorInput(c)}
                          className={`w-5 h-5 rounded-full ${NOTE_COLOR_CLASSES[c].dot} transition-transform ${
                            colorInput === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                          }`}
                          title={NOTE_COLOR_CLASSES[c].name}
                        />
                      ))}
                    </div>

                    <span className="text-slate-700">|</span>

                    {/* Mode Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsChecklistMode(!isChecklistMode)}
                      className={`p-1 rounded hover:bg-slate-800 ${
                        isChecklistMode ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={isChecklistMode ? 'Switch to text note' : 'Switch to checklist'}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </button>

                    {/* Tag input */}
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5">
                      <Tag className="w-3 h-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tag..."
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        className="bg-transparent text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none w-14 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3 py-1 rounded-xl text-slate-400 hover:text-white font-mono text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs transition-all active:scale-95 shadow-md shadow-amber-500/20"
                    >
                      {editingNoteId ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: PINNED NOTES */}
          {pinnedNotes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                <Pin className="w-3.5 h-3.5 text-amber-400" />
                <span>Pinned ({pinnedNotes.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}

          {/* Section: OTHER NOTES */}
          <div className="space-y-3">
            {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
              <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                <span>Others ({unpinnedNotes.length})</span>
              </div>
            )}
            {unpinnedNotes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {unpinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            ) : pinnedNotes.length === 0 ? (
              <div className="text-center py-12 space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-200 font-sans">No trading notes match filter</div>
                <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
                  Capture execution insights, checklists, and risk rules to sharpen your edge.
                </p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold transition-all"
                >
                  Create First Note
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Note Deletion (MANDATORY per Workspace Skill) */}
      {noteToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-sans">Delete Trading Note?</h3>
                <p className="text-xs text-slate-400 font-mono">This action permanently deletes the note.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono space-y-1">
              <span className="font-bold text-slate-200 block truncate">{noteToDelete.title}</span>
              <p className="text-slate-400 line-clamp-2">{noteToDelete.content}</p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setNoteToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl text-slate-300 hover:text-white font-mono text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-mono text-xs font-bold transition-all shadow-md shadow-rose-500/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderNoteCard(note: TradingNote) {
    const colorStyle = NOTE_COLOR_CLASSES[note.color] || NOTE_COLOR_CLASSES.default;

    return (
      <div
        key={note.id}
        onClick={() => handleStartEdit(note)}
        className={`${colorStyle.bg} border ${colorStyle.border} rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer group relative`}
      >
        <div className="space-y-2">
          {/* Card Top: Title & Pin */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-bold text-xs sm:text-sm text-slate-100 font-sans leading-snug line-clamp-2">
              {note.title}
            </h4>
            <button
              type="button"
              onClick={(e) => handleTogglePin(note, e)}
              className={`p-1 rounded-lg transition-all shrink-0 ${
                note.isPinned
                  ? 'text-amber-400 bg-amber-500/20 border border-amber-500/40'
                  : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-200'
              }`}
              title={note.isPinned ? 'Unpin' : 'Pin'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card Body: Text or Checklist */}
          {note.checklist && note.checklist.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {note.checklist.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  onClick={(e) => handleToggleChecklistItem(note, item.id, e)}
                  className="flex items-center gap-2 text-xs font-mono hover:text-amber-300 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    readOnly
                    className="accent-amber-500 rounded cursor-pointer"
                  />
                  <span className={`truncate ${item.checked ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                    {item.text}
                  </span>
                </div>
              ))}
              {note.checklist.length > 5 && (
                <span className="text-[10px] text-slate-500 font-mono block">
                  +{note.checklist.length - 5} more items...
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-300 font-mono leading-relaxed line-clamp-5 whitespace-pre-line">
              {note.content}
            </p>
          )}

          {/* Tag Badges */}
          {note.tags && note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-1">
              {note.tags.map((t) => (
                <span
                  key={t}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-400 border border-slate-800"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card Footer: Timestamp & Action Icons */}
        <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Color Switcher */}
            <div className="flex items-center gap-0.5">
              {(['default', 'amber', 'emerald', 'cyan'] as NoteColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => handleChangeNoteColor(note, c, e)}
                  className={`w-3.5 h-3.5 rounded-full ${NOTE_COLOR_CLASSES[c].dot} ${
                    note.color === c ? 'ring-1 ring-white' : 'opacity-60 hover:opacity-100'
                  }`}
                  title={NOTE_COLOR_CLASSES[c].name}
                />
              ))}
            </div>

            {/* Copy Content */}
            <button
              type="button"
              onClick={(e) => handleCopyNoteContent(note, e)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              title="Copy Note Text"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Open in Google Keep */}
            <button
              type="button"
              onClick={(e) => handleOpenInGoogleKeep(note, e)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400"
              title="Open in Google Keep"
            >
              <ExternalLink className="w-3 h-3" />
            </button>

            {/* Export to Google Docs */}
            <button
              type="button"
              onClick={(e) => handleExportToGoogleDocs(note, e)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400"
              title="Export to Google Docs"
            >
              <FileText className="w-3 h-3" />
            </button>

            {/* Delete Note */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNoteToDelete(note);
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400"
              title="Delete Note"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }
};
