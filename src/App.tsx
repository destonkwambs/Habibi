import React, { useState, useEffect } from 'react';
import { googleSignIn, logout, db, initAuth } from './firebase';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { MemoryItem, UserSettings } from './types';
import { ChatTab } from './components/ChatTab';
import { WorkspaceTab } from './components/WorkspaceTab';
import { DreamTab } from './components/DreamTab';
import { VeoTab } from './components/VeoTab';
import { MemoryTab } from './components/MemoryTab';
import { MessageSquare, FolderGit2, Sparkles, Video, BrainCircuit, LogOut, Clock, ShieldCheck, Heart, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Active Main Tab selector
  const [activeTab, setActiveTab] = useState<'chat' | 'workspace' | 'dream' | 'veo' | 'memory'>('chat');

  // Stentuner Profiles & Memories States
  const [nickname, setNickname] = useState('Stentuner');
  const [voiceName, setVoiceName] = useState('Zephyr');
  const [themeColor, setThemeColor] = useState<'amber' | 'emerald' | 'cyan' | 'rose' | 'slate'>('rose');
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  // Real-time clock for beautiful layout pairing
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    // Clock setup
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Standard Firebase Auth observer setup
    const unsubscribeAuth = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setAuthChecking(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setAuthChecking(false);
      }
    );

    return () => unsubscribeAuth();
  }, []);

  // Fetch / Sync memories and configurations once user is identified
  useEffect(() => {
    if (!user) {
      setMemories([]);
      return;
    }

    // 1. Listen to Memories collection for current user
    const memoriesQuery = query(
      collection(db, 'memories'),
      where('userId', '==', user.uid)
    );

    const unsubscribeMemories = onSnapshot(memoriesQuery, (snapshot) => {
      const items: MemoryItem[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        items.push({
          id: doc.id,
          fact: d.fact,
          category: d.category,
          createdAt: d.createdAt
        });
      });
      // Sort memories by date
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMemories(items);
    });

    // 2. Fetch User Prefs from Firestore
    const loadUserPrefs = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.nickname) setNickname(data.nickname);
          if (data.voiceName) setVoiceName(data.voiceName);
          if (data.themeColor) setThemeColor(data.themeColor);
        } else {
          // Create initial baseline document
          await setDoc(docRef, {
            nickname: 'Stentuner',
            voiceName: 'Zephyr',
            themeColor: 'rose',
            email: user.email
          });
        }
      } catch (err) {
        console.error('Failed loading profile params:', err);
      }
    };
    loadUserPrefs();

    return () => unsubscribeMemories();
  }, [user]);

  const handleSignIn = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setLoginError('Authentication popup was blocked by browser. Please enable popups and click Sign In again, habibi!');
      } else {
        setLoginError(err.message || 'Failed login to Google services. Please retry.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Do you want to sign out from your Habibi panel?')) {
      await logout();
      setUser(null);
      setAccessToken(null);
    }
  };

  const updateNickname = async (newName: string) => {
    setNickname(newName);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { nickname: newName }, { merge: true });
      } catch (e) {}
    }
  };

  const updateVoiceName = async (newVoice: string) => {
    setVoiceName(newVoice);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { voiceName: newVoice }, { merge: true });
      } catch (e) {}
    }
  };

  const updateThemeColor = async (newTheme: 'amber' | 'emerald' | 'cyan' | 'rose' | 'slate') => {
    setThemeColor(newTheme);
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), { themeColor: newTheme }, { merge: true });
      } catch (e) {}
    }
  };

  const getThemeTextClass = () => {
    return `text-${themeColor}-400`;
  };

  const getThemeBgClass = () => {
    return `bg-${themeColor}-600 hover:bg-${themeColor}-500`;
  };

  const getThemeBorderClass = () => {
    return `border-${themeColor}-500/20`;
  };

  const getThemeHeartGradient = () => {
    switch (themeColor) {
      case 'rose': return 'from-rose-500 to-pink-500';
      case 'cyan': return 'from-cyan-500 to-blue-500';
      case 'emerald': return 'from-emerald-500 to-teal-500';
      case 'slate': return 'from-slate-500 to-gray-500';
      case 'amber':
      default:
        return 'from-amber-500 to-orange-400';
    }
  };

  const getThemeHeartShadowHex = () => {
    switch (themeColor) {
      case 'rose': return 'rgba(244,63,94,0.6)';
      case 'cyan': return 'rgba(6,182,212,0.6)';
      case 'emerald': return 'rgba(16,185,129,0.6)';
      case 'slate': return 'rgba(100,116,139,0.6)';
      case 'amber':
      default:
        return 'rgba(245,158,11,0.6)';
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Heart className="w-12 h-12 text-rose-500 animate-pulse" />
        <h3 className="font-display font-medium text-slate-350 text-sm tracking-wider uppercase">
          Aligning With Habibi...
        </h3>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans antialiased text-[#d1d1d6] relative bg-[#0a0a0c] selection:bg-${themeColor}-500/30 overflow-x-hidden`} id="main_app_wrapper">
      
      {/* Absolute background visual ambient elements matching Immersive UI */}
      <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] bg-amber-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className={`absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] bg-gradient-to-tr ${
        themeColor === 'rose' ? 'from-rose-500/10 to-pink-500/5' :
        themeColor === 'emerald' ? 'from-emerald-500/10 to-teal-500/5' :
        themeColor === 'cyan' ? 'from-cyan-500/10 to-blue-500/5' :
        themeColor === 'slate' ? 'from-slate-500/10 to-gray-500/5' :
        'from-amber-500/10 to-orange-500/5'
      } blur-[120px] rounded-full pointer-events-none`} />

      {!user ? (
        /* Sign-in Welcome Gate specifically polished for Stentuner */
        <div className="min-h-screen flex items-center justify-center p-6" id="welcome_gate">
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-[0_10px_40px_rgba(0,0,0,0.3)] relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-300`} />
            
            <div className="text-center space-y-5">
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-orange-300 flex items-center justify-center text-xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                ❤️
              </div>

              <div>
                <h1 className="font-display font-bold text-white text-2.5xl tracking-wide">Habibi<span className="text-amber-400">🥰</span></h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1 font-semibold">Deeply Personal Assistant</p>
                <p className="text-xs text-slate-300 mt-3 font-sans leading-relaxed">
                  Your deeply personal, emotionally intelligent companion. Warm, witty, loyal, and razor-sharp.
                </p>
              </div>

              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-left space-y-2">
                <p className="text-[11px] font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5 leading-none">
                  <ShieldCheck size={13} className="text-emerald-400" /> Integrated Google Workspace Hub
                </p>
                <p className="text-[10px] text-slate-400 font-sans leading-normal">
                  Authenticating seamlessly activates secure, direct API integrations with your <strong>Gmail Inbox</strong>, <strong>Google Calendars</strong>, <strong>Drive Documents</strong>, and <strong>To-Do Tasks</strong>. Zero data intercepts, maximum privacy.
                </p>
              </div>

              {loginError && (
                <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-2xl flex items-center gap-2 text-3xs text-red-301 text-left">
                  <p className="leading-snug">{loginError}</p>
                </div>
              )}

              <button
                onClick={handleSignIn}
                disabled={loginLoading}
                className="cursor-pointer w-full py-3.5 bg-white hover:bg-slate-50 text-slate-950 font-bold text-xs rounded-2xl tracking-wide transition duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-black/20"
              >
                {loginLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                {loginLoading ? 'Waking up Habibi...' : 'Sign In on Google Workspace'}
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        /* Authenticated Main Dashboard Workspace specifically tailored for Stentuner */
        <div className="w-full max-w-7xl mx-auto px-4 py-4 md:py-6 flex flex-col min-h-screen justify-between gap-4 md:gap-5" id="authenticated_desk">
          
          {/* Header Row styled with Immersive UI */}
          <header className="flex flex-col sm:flex-row items-center justify-between p-4 sm:px-8 bg-black/20 backdrop-blur-md rounded-2xl border border-white/5 gap-4 z-10" id="app_header">
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ scale: 0.1, rotate: -45, opacity: 0 }}
                animate={{ 
                  scale: [1, 1.12, 1],
                  opacity: 1,
                  rotate: [0, -4, 4, 0],
                  boxShadow: [
                    `0 0 10px ${getThemeHeartShadowHex()}`,
                    `0 0 25px ${getThemeHeartShadowHex()}`,
                    `0 0 10px ${getThemeHeartShadowHex()}`
                  ]
                }}
                transition={{
                  scale: {
                    repeat: Infinity,
                    duration: 1.8,
                    ease: "easeInOut"
                  },
                  boxShadow: {
                    repeat: Infinity,
                    duration: 1.8,
                    ease: "easeInOut"
                  },
                  rotate: {
                    duration: 3.0,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "reverse" as const
                  },
                  default: {
                    type: "spring",
                    stiffness: 150,
                    damping: 10
                  }
                }}
                className={`w-10 h-10 rounded-full bg-gradient-to-tr ${getThemeHeartGradient()} flex items-center justify-center text-white font-sans select-none shrink-0 cursor-pointer`}
              >
                <Heart className="w-5 h-5 fill-current text-white" />
              </motion.div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-white">Habibi<span className="text-amber-400">🥰</span></h1>
                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/40 mt-0.5">Deeply Personal Assistant</p>
              </div>
            </div>

            {/* Right Header Panel with Info Badges & Control Links */}
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[9px] sm:text-xs font-medium text-emerald-400/80 uppercase tracking-widest">Syncing: {nickname}</span>
              </div>

              {/* Clock widget styled under Immersive theme */}
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 font-mono text-xs text-white/60">
                <Clock size={13} className="text-amber-400" />
                <span>UTC: {timeStr || '00:00:00'}</span>
              </div>

              {/* Settings gear or color check indicator */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/30 font-mono">
                {user.email}
              </div>

              <button
                onClick={handleLogout}
                className="cursor-pointer w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors text-white/60 hover:text-red-400"
                title="Disconnect Persona"
              >
                <LogOut size={15} />
              </button>
            </div>
          </header>

          {/* Quick Primary Tab Navigation */}
          <div className="bg-white/5 backdrop-blur-md p-1.5 rounded-2xl border border-white/5 grid grid-cols-2 sm:grid-cols-5 gap-2" id="primary_nav">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
                activeTab === 'chat'
                  ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                  : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <MessageSquare size={14} /> Habibi Chat
            </button>

            <button
              onClick={() => setActiveTab('workspace')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
                activeTab === 'workspace'
                  ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                  : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <FolderGit2 size={14} /> Workspace Hub
            </button>

            <button
              onClick={() => setActiveTab('dream')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
                activeTab === 'dream'
                  ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                  : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Sparkles size={14} /> Dream Canvas
            </button>

            <button
              onClick={() => setActiveTab('veo')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
                activeTab === 'veo'
                  ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                  : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Video size={14} /> Cinematic Studio
            </button>

            <button
              onClick={() => setActiveTab('memory')}
              className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer text-xs font-semibold transition-all ${
                activeTab === 'memory'
                  ? `bg-${themeColor}-500/10 text-${themeColor}-300 border border-${themeColor}-500/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]`
                  : 'bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <BrainCircuit size={14} /> Memory & Rules
            </button>
          </div>

          {/* Active View Container */}
          <main className="flex-grow min-h-0" id="main_workspace">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {activeTab === 'chat' && (
                  <ChatTab 
                    userId={user.uid} 
                    userEmail={user.email || ''} 
                    nickname={nickname} 
                    themeColor={themeColor} 
                    memories={memories} 
                  />
                )}
                
                {activeTab === 'workspace' && (
                  <WorkspaceTab 
                    themeColor={themeColor} 
                    nickname={nickname} 
                  />
                )}

                {activeTab === 'dream' && (
                  <DreamTab 
                    themeColor={themeColor} 
                  />
                )}

                {activeTab === 'veo' && (
                  <VeoTab 
                    themeColor={themeColor} 
                  />
                )}

                {activeTab === 'memory' && (
                  <MemoryTab 
                    userId={user.uid} 
                    nickname={nickname} 
                    voiceName={voiceName} 
                    themeColor={themeColor} 
                    onUpdateNickname={updateNickname}
                    onUpdateVoiceName={updateVoiceName}
                    onUpdateThemeColor={updateThemeColor}
                    memories={memories} 
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      )}
    </div>
  );
}
