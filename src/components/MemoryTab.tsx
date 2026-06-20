import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc } from 'firebase/firestore';
import { MemoryItem, UserSettings } from '../types';
import { BrainCircuit, User, Volume2, Palette, Trash2, Plus, Sparkles, Check, Bookmark, AlertCircle, Search, X } from 'lucide-react';
import { motion } from 'motion/react';

interface MemoryTabProps {
  userId: string;
  nickname: string;
  voiceName: string;
  themeColor: 'amber' | 'emerald' | 'cyan' | 'rose' | 'slate';
  onUpdateNickname: (name: string) => void;
  onUpdateVoiceName: (voice: string) => void;
  onUpdateThemeColor: (color: 'amber' | 'emerald' | 'cyan' | 'rose' | 'slate') => void;
  memories: MemoryItem[];
}

const THEME_PRESETS = [
  { id: 'rose', name: 'Cosmic Rose', colorClass: 'bg-rose-500', glowColor: 'rgba(244,63,94,0.4)', borderClass: 'border-rose-500/30', activeText: 'text-rose-350', activeBg: 'bg-rose-500/10' },
  { id: 'cyan', name: 'Cyber Cyan', colorClass: 'bg-cyan-500', glowColor: 'rgba(6,182,212,0.4)', borderClass: 'border-cyan-500/30', activeText: 'text-cyan-350', activeBg: 'bg-cyan-500/10' },
  { id: 'emerald', name: 'Enchanted Emerald', colorClass: 'bg-emerald-500', glowColor: 'rgba(16,185,129,0.4)', borderClass: 'border-emerald-500/30', activeText: 'text-emerald-350', activeBg: 'bg-emerald-500/10' },
  { id: 'amber', name: 'Warm Amber', colorClass: 'bg-amber-500', glowColor: 'rgba(245,158,11,0.4)', borderClass: 'border-amber-500/30', activeText: 'text-amber-300', activeBg: 'bg-amber-500/10' },
  { id: 'slate', name: 'Nordic Slate', colorClass: 'bg-slate-500', glowColor: 'rgba(100,116,139,0.4)', borderClass: 'border-slate-500/30', activeText: 'text-slate-300', activeBg: 'bg-slate-500/10' }
] as const;

export const MemoryTab: React.FC<MemoryTabProps> = ({
  userId,
  nickname,
  voiceName,
  themeColor,
  onUpdateNickname,
  onUpdateVoiceName,
  onUpdateThemeColor,
  memories
}) => {
  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState('Preference');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMemories = memories.filter(m => 
    m.fact.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;

    setErrorMsg('');
    setLoading(true);

    try {
      await addDoc(collection(db, 'memories'), {
        userId,
        fact: newFact.trim(),
        category: newCategory,
        createdAt: new Date().toISOString()
      });

      setNewFact('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to save memory fact to Firestore.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      await deleteDoc(doc(db, 'memories', memoryId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)] animate-fade-in" id="memory_tab_grid">
      {/* LEFT COLUMN: Profile & Settings */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5 flex flex-col justify-between h-full shadow-xl" id="profile_config_panel">
        <div className="space-y-5">
          <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 flex items-center gap-1.5">
            <User size={15} /> PROFILE & CUSTOM PERSONA
          </h3>

          <div className="space-y-4">
            {/* Nickname setting */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">STENTUNER'S NICKNAME</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => onUpdateNickname(e.target.value)}
                placeholder="He answers to Stentuner"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/90 focus:border-amber-500/50 outline-none transition-all font-sans"
              />
              <p className="text-[10px] text-white/30 mt-1.5 font-sans leading-relaxed uppercase tracking-wider">
                Tell Habibi how you would prefer to be addressed in conversations.
              </p>
            </div>

            {/* Prebuilt voices setting */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">LIVE VOICE PRESET (LIVE API)</label>
              <select
                value={voiceName}
                onChange={(e) => onUpdateVoiceName(e.target.value)}
                className="w-full bg-[#0a0a0c]/85 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 outline-none transition-all"
              >
                <option value="Zephyr">Zephyr (Warm, conversational, crisp)</option>
                <option value="Kore">Kore (Smooth, authoritative, deeper)</option>
                <option value="Puck">Puck (Cheerful, high-energy, friendly)</option>
                <option value="Charon">Charon (Calm, wise, vintage-resonance)</option>
                <option value="Fenrir">Fenrir (Deep, resonant cinematic voice)</option>
              </select>
            </div>

            {/* Custom Theme selection presets with visual previews & swatches */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-3.5">INTERFACE AMBIENCE COLOR</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {THEME_PRESETS.map((preset) => {
                  const isActive = themeColor === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateThemeColor(preset.id)}
                      className={`group/btn cursor-pointer p-3 border rounded-2xl flex flex-col items-center justify-between gap-3 text-left transition-all duration-300 relative overflow-hidden ${
                        isActive
                          ? `${preset.borderClass} ${preset.activeBg} ${preset.activeText} shadow-md`
                          : 'border-white/5 bg-white/2 text-white/40 hover:border-white/10 hover:bg-white/5 hover:text-white/80'
                      }`}
                      style={{
                        boxShadow: isActive ? `0 0 15px ${preset.glowColor}` : 'none'
                      }}
                    >
                      {/* Interactive Visual Applet Mockup Preview box */}
                      <div className="w-full bg-[#0a0a0c] rounded-xl p-2 border border-white/5 flex flex-col gap-1.5 transition-all relative overflow-hidden h-[60px] justify-between">
                        {/* Interactive miniature ambient glow */}
                        <div 
                          className={`absolute -bottom-8 -right-8 w-16 h-16 rounded-full blur-xl opacity-30 transition-all duration-300 ${
                            isActive ? 'opacity-50 scale-125' : 'group-hover/btn:opacity-40'
                          } ${preset.colorClass}`} 
                        />

                        {/* Top layout line */}
                        <div className="flex items-center justify-between relative z-10 font-sans">
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${preset.colorClass} ${isActive ? 'animate-pulse' : ''}`} />
                            <div className="w-8 h-1 bg-white/20 rounded" />
                          </div>
                          <div className="w-3 h-1 bg-white/15 rounded" />
                        </div>

                        {/* Mini Chat bubbles mimicking Habibi conversation */}
                        <div className="space-y-1 relative z-10">
                          {/* Partner response bubble */}
                          <div className="w-9 h-2 bg-white/5 rounded-sm" />
                          {/* User active response bubble in custom theme style */}
                          <div className="flex justify-end">
                            <div 
                              className={`h-2 rounded transition-all duration-300 ${
                                isActive ? `${preset.colorClass} w-10` : 'bg-white/15 w-6 group-hover/btn:bg-white/25'
                              }`} 
                            />
                          </div>
                        </div>

                        {/* Bottom action indicator */}
                        <div 
                          className={`w-full h-[2px] rounded transition-all duration-300 relative z-10 ${
                            isActive ? preset.colorClass : 'bg-white/5'
                          }`} 
                        />
                      </div>

                      {/* Swatch control row and name */}
                      <div className="flex items-center gap-2 w-full justify-start pl-1 z-10">
                        {/* Swatch Circle with motion hover zoom & indicator */}
                        <div className="relative flex items-center justify-center shrink-0">
                          <motion.span 
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            className={`w-4 h-4 rounded-full flex items-center justify-center relative cursor-pointer ${preset.colorClass}`}
                          >
                            {isActive && (
                              <motion.span 
                                layoutId="activeCheck"
                                className="w-1.5 h-1.5 bg-black rounded-full"
                              />
                            )}
                          </motion.span>
                          
                          {/* Outer breathing ring animation for active swatch */}
                          {isActive && (
                            <span 
                              className={`absolute -inset-1 rounded-full border border-dashed animate-spin [animation-duration:10s]`}
                              style={{ borderColor: preset.glowColor }}
                            />
                          )}
                        </div>

                        {/* Theme Name */}
                        <span className="text-[10px] font-bold font-sans truncate tracking-tight">{preset.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-[10px] text-white/40 font-semibold tracking-wide uppercase leading-relaxed flex items-center gap-2.5">
          <Bookmark size={15} className="text-amber-500 shrink-0" />
          <p>
            These custom configurations are synchronized with Habibi's local server runtime and Firestore, meaning they carry over naturally into any voice or text-session with you.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Memory Board facts */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5 flex flex-col justify-between h-full shadow-lg overflow-hidden" id="memory_board_panel">
        <div className="flex flex-col flex-1 overflow-hidden gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 flex items-center gap-1.5">
              <BrainCircuit size={15} /> HABIBI'S MEMORY BOARD
            </h3>
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-3 py-1 rounded-full font-mono font-semibold uppercase tracking-wider">
              {memories.length} Facts Saved
            </span>
          </div>

          {/* Add custom memories form */}
          <form onSubmit={handleAddMemory} className="grid grid-cols-1 md:grid-cols-4 gap-2.5 p-4 bg-white/5 border border-white/10 rounded-xl" id="add_memory_item_form">
            <div className="md:col-span-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1">NEW REMEMBERED FACT</label>
              <input
                type="text"
                required
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder="His favorite coffee is Dry Cappuccino..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 outline-none transition-all font-sans"
              />
            </div>
            <div className="md:col-span-1 flex items-end">
              <button
                type="submit"
                disabled={loading || !newFact.trim()}
                className="cursor-pointer w-full h-[40px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition flex items-center justify-center gap-1"
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="p-2.5 bg-red-950/30 border border-red-500/20 rounded-xl flex items-center gap-1.5 text-xs text-red-300">
              <AlertCircle size={14} /> {errorMsg}
            </div>
          )}

          {/* Real-time search filter */}
          {memories.length > 0 && (
            <div className="relative" id="memories_search_wrapper">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-white/30">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories and customs by keyword..."
                className="w-full bg-[#0a0a0c]/40 border border-white/5 rounded-xl pl-9.5 pr-9 py-2 text-xs text-white/90 focus:border-amber-500/30 focus:bg-white/5 outline-none transition-all placeholder:text-white/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/30 hover:text-white/60 transition"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Memory board items scroller */}
          <div className="flex-grow overflow-y-auto space-y-3 pr-1" id="memories_list_thread">
            {memories.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-xs font-sans italic">
                Habibi's Memory Board is blank! Input preferences above to give Habibi custom insights about you.
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-xs font-sans italic flex flex-col items-center justify-center gap-2">
                <Search size={16} className="text-white/20 animate-pulse mb-1" />
                <span>No matching memories found for "{searchQuery}"</span>
              </div>
            ) : (
              filteredMemories.map((m) => (
                <div 
                  key={m.id}
                  className="flex items-start justify-between p-4 bg-white/2 border border-white/5 hover:border-white/10 hover:bg-white/5 rounded-xl shadow-sm transition"
                >
                  <p className="text-xs text-white/80 font-sans leading-relaxed flex-1 pr-3 select-text select-all">
                    "{m.fact}"
                  </p>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    className="p-1.5 rounded-lg text-white/40 hover:bg-red-500/20 hover:text-red-400 transition"
                    title="Forgets fact"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-[10px] text-white/40 font-semibold tracking-wide uppercase leading-relaxed">
          💡 **How memories work**: Any fact listed above is supplied to Habibi's model background memory constraints on every prompt turn, allowing her to remember and speak naturally with personalized callback insights!
        </div>
      </div>
    </div>
  );
};
