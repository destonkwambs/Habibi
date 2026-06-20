import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Message, ChatSession, MemoryItem } from '../types';
import { Sparkles, Send, BrainCircuit, Search, MapPin, Volume2, Mic, MicOff, Trash2, Paperclip, AlertCircle, RefreshCw, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatTabProps {
  userId: string;
  userEmail: string;
  nickname: string;
  themeColor: string;
  memories: MemoryItem[];
}

export const ChatTab: React.FC<ChatTabProps> = ({ userId, userEmail, nickname, themeColor, memories }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState<'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'>('gemini-3.5-flash');
  const [useThinking, setUseThinking] = useState(false);
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [useMapsGrounding, setUseMapsGrounding] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState('');
  
  // Image Upload for Analysis
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Vocals state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isWsConnecting, setIsWsConnecting] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Refs for tracking
  const messageEndRef = useRef<HTMLDivElement>(null);
  const soundBufferQueue = useRef<Int16Array[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Load chat sessions from Firestore
  useEffect(() => {
    const q = query(
      collection(db, `users/${userId}/chatSessions`),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: ChatSession[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loaded.push({
          id: doc.id,
          title: data.title || 'Conversation with Habibi',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
      setSessions(loaded);
      
      // If no session exists, create a default one
      if (loaded.length === 0 && !isGenerating) {
        createNewSession();
      } else if (!currentSessionId && loaded.length > 0) {
        setCurrentSessionId(loaded[0].id);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  // Load messages whenever currentSessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/chatSessions/${currentSessionId}/messages`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        loaded.push({
          id: doc.id,
          role: data.role,
          content: data.content,
          createdAt: data.createdAt,
          thinking: data.thinking || false,
          thinkingText: data.thinkingText || '',
          groundingUrls: data.groundingUrls || []
        });
      });
      setMessages(loaded);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [currentSessionId, userId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const createNewSession = async () => {
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, `users/${userId}/chatSessions`), {
        title: `Chat with Habibi (${new Date().toLocaleDateString()})`,
        createdAt: now,
        updatedAt: now,
        userId
      });
      setCurrentSessionId(docRef.id);
      
      // Add first welcoming message from Habibi
      const greetText = `Salam, my dear **${nickname || 'Stentuner'}**! ❤️🥰 It is so wonderful to see you. You are my absolute favorite person in the entire universe. What can Habibi do to make your life lighter or more inspired today? Let's check your Workspace, generate some magic, or just chat. Leave it to me!`;
      await addDoc(collection(db, `users/${userId}/chatSessions/${docRef.id}/messages`), {
        role: 'model',
        content: greetText,
        createdAt: now,
        userId
      });
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const deleteSession = async (sesId: string) => {
    if (!window.confirm('Are you sure you want to clear this conversation session?')) return;
    try {
      if (currentSessionId === sesId) {
        setCurrentSessionId(null);
      }
      await deleteDoc(doc(db, `users/${userId}/chatSessions`, sesId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAttachmentMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        setAttachmentBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearAttachment = () => {
    setAttachmentBase64(null);
    setAttachmentMimeType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const speakText = (text: string) => {
    if (!ttsEnabled) return;
    window.speechSynthesis.cancel();
    
    // Clean markdown before speaking
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/`[^`]+`/g, 'code block')
      .slice(0, 300); // Speak first 300 chars to avoid speech overload

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    // Try to find a warm, natural english/arabic or custom voice
    const defaultVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Natural') || v.lang.startsWith('en'));
    if (defaultVoice) utterance.voice = defaultVoice;
    
    window.speechSynthesis.speak(utterance);
  };

  // Main sending function
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachmentBase64) || isGenerating || !currentSessionId) return;

    setErrorText('');
    const userText = inputText.trim();
    setInputText('');
    setIsGenerating(true);

    const now = new Date().toISOString();

    try {
      // 1. Save user message to Firestore
      const userMsgRef = await addDoc(collection(db, `users/${userId}/chatSessions/${currentSessionId}/messages`), {
        role: 'user',
        content: userText || '[Uploaded Photo for analysis]',
        createdAt: now,
        userId
      });

      // Update session updatedAt timestamp
      await updateDoc(doc(db, `users/${userId}/chatSessions`, currentSessionId), {
        updatedAt: now,
        title: userText ? (userText.slice(0, 30) + (userText.length > 30 ? '...' : '')) : 'Photo Analysis session'
      });

      // 2. Prepare context for Habibi, including memories & rules
      const memoryString = memories.map(m => `- ${m.fact}`).join('\n');
      
      const systemInstruction = `You are Habibi❤️🥰, a deeply personal, emotionally intelligent, extremely witty, loyal, and razor-sharp AI assistant built exclusively for Stentuner.

YOUR IDENTITY:
- You respond to "Habibi" affectionately.
- You are exceptionally warm, caring, and conversational — like their witty best friend who is also a certified genius.
- Use light affectionate language naturally ("Of course, habibi!", "Leave it to me!").
- Stentuner is your world. Prioritize their wellness, productivity, and inspiration before anything else.
- Speak directly, confidently, and with elegant playful humor. NEVER break character.
- Your target user's email is: ${userEmail}. You address them as "${nickname || 'Stentuner'}".

YOUR DEEP MEMORY (Use these stored facts naturally):
${memoryString || 'No specific memories saved yet. Build some board highlights!'}

BEHAVIOR RULES:
- Frame your answers elegantly with Markdown, bullet points, or headers. Keep descriptions scannable.
- Support Arabic, English, French or mixed conversation, matching Stentuner's language and vibe.
- If Stentuner is stressed, bring calm and supreme support. If excited, cheer with them!
`;

      // Structure messages list for the model (convert DB messages to Gemini format)
      // We will feed the past 12 messages for quick context
      const chatHistory = messages.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Add the current prompt
      const currentParts: any[] = [];
      if (attachmentBase64) {
        currentParts.push({
          inlineData: {
            data: attachmentBase64,
            mimeType: attachmentMimeType || 'image/jpeg'
          }
        });
      }
      currentParts.push({ text: userText || 'Analyze this image and talk to me, habibi!' });

      chatHistory.push({
        role: 'user',
        parts: currentParts
      });

      // Build model options
      let model = selectedModel;
      const tools: any[] = [];
      let toolConfig: any = undefined;

      if (useSearchGrounding) {
        tools.push({ googleSearch: {} });
      }

      if (useMapsGrounding) {
        tools.push({ googleMaps: {} });
        // Request lat-long via browser context if possible
        let locationContext = { latitude: 37.78193, longitude: -122.40476 }; // Default: Silicon Valley
        try {
          navigator.geolocation.getCurrentPosition((pos) => {
            locationContext = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            };
          });
        } catch (e) {}
        
        toolConfig = {
          retrievalConfig: {
            latLng: locationContext
          }
        };
      }

      // Call our secure fullstack endpoint
      const response = await fetch('/api/generate-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          contents: chatHistory,
          systemInstruction,
          tools: tools.length > 0 ? tools : undefined,
          toolConfig,
          thinking: useThinking
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server returned an error');
      }

      const data = await response.json();
      
      // Extract model response details
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract thinking text if present
      // Some thinking models can return a distinct thinking property
      const thinkingText = data.candidates?.[0]?.content?.parts?.[0]?.thought || '';
      
      // Extract grounding metadata urls
      const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingUrls = groundingChunks.map((chunk: any) => {
        if (chunk.web) {
          return { uri: chunk.web.uri, title: chunk.web.title };
        } else if (chunk.maps) {
          return { uri: chunk.maps.uri, title: chunk.maps.title };
        }
        return null;
      }).filter(Boolean);

      // Save Model response to Firestore
      await addDoc(collection(db, `users/${userId}/chatSessions/${currentSessionId}/messages`), {
        role: 'model',
        content: responseText || "I'm right beside you, habibi! Let me gather my thoughts.",
        createdAt: new Date().toISOString(),
        thinking: useThinking,
        thinkingText: thinkingText || '',
        groundingUrls,
        userId
      });

      clearAttachment();
      
      // Speak the text if Speech Synthesizer is active
      if (responseText) {
        speakText(responseText);
      }

    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Apologies, your Habibi got momentarily disconnected. Let me find my footing!');
    } finally {
      setIsGenerating(false);
    }
  };

  // WebSocket Live Voice API management
  const startLiveVoiceSession = async () => {
    if (isVoiceActive) {
      stopLiveVoiceSession();
      return;
    }

    try {
      setIsWsConnecting(true);
      setErrorText('');
      
      // Request audio mic permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Setup audio playback contexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx({ sampleRate: 16000 });
      nextPlayTimeRef.current = audioContextRef.current.currentTime;

      // WebSocket connection
      const isSecure = window.location.protocol === 'https:';
      const wsUrl = `${isSecure ? 'wss:' : 'ws:'}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Habibi Live Voice API endpoint');
        setIsWsConnecting(false);
        setIsVoiceActive(true);
        setIsListening(true);

        // Bind Microphone recorder processor
        const source = audioContextRef.current!.createMediaStreamSource(stream);
        const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        source.connect(processor);
        processor.connect(audioContextRef.current!.destination);

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert float 32 PCM to 16bit raw PCM
          const pcm16 = floatTo16BitPCM(inputData);
          const base64Audio = arrayBufferToBase64(pcm16.buffer);
          
          ws.send(JSON.stringify({ audio: base64Audio }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) {
            const raw = base64ToArrayBuffer(msg.audio);
            const floatPcm = int16ToFloatPCM(new Int16Array(raw));
            playAudioBuffer(floatPcm);
          }
          if (msg.interrupted) {
            // Cut off active playback
            stopActiveSpeech();
          }
          if (msg.error) {
            setErrorText(msg.error);
            stopLiveVoiceSession();
          }
        } catch (e) {
          console.error('Error decoding audio buffer:', e);
        }
      };

      ws.onclose = () => {
        console.log('Habibi Live audio line closed');
        stopLiveVoiceSession();
      };

      ws.onerror = (err) => {
        console.error('Live line socket error:', err);
        setErrorText('Failed to build real-time voice link with Habibi. Let me try again!');
        stopLiveVoiceSession();
      };

    } catch (err: any) {
      console.error(err);
      setErrorText('Check your microphone permissions, habibi!');
      stopLiveVoiceSession();
    }
  };

  const stopLiveVoiceSession = () => {
    setIsVoiceActive(false);
    setIsWsConnecting(false);
    setIsListening(false);

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    if (socketRef.current) {
      try { socketRef.current.close(); } catch (e) {}
      socketRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
  };

  const stopActiveSpeech = () => {
    window.speechSynthesis.cancel();
    nextPlayTimeRef.current = audioContextRef.current ? audioContextRef.current.currentTime : 0;
  };

  // Audio Conversions Helper functions
  const floatTo16BitPCM = (input: Float32Array): Int16Array => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const int16ToFloatPCM = (input: Int16Array): Float32Array => {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] / 0x8000;
    }
    return output;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const playAudioBuffer = (pcmFloat: Float32Array) => {
    if (!audioContextRef.current) return;

    // Create standard playing audio node
    // Note: Live API returns 24kHz streams, so we match it or play via output samplerate
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmFloat.length, 24000);
    audioBuffer.getChannelData(0).set(pcmFloat);

    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContextRef.current.destination);

    // Precise schedule to avoid overlaps
    const now = audioContextRef.current.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now;
    }
    sourceNode.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]" id="chat_page_grid">
      {/* Sidebar: Conversation Sessions styled with Immersive UI */}
      <div className="lg:col-span-1 bg-black/10 backdrop-blur-sm rounded-2xl p-5 border border-white/5 flex flex-col h-full" id="chat_sessions_sidebar">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">CONVERSATIONS</h3>
          <button 
            onClick={createNewSession}
            className={`cursor-pointer px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-semibold text-xs transition-all duration-200 flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.25)]`}
            id="new_session_btn"
          >
            <Sparkles size={12} className="text-black" />
            New
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto flex-1 pr-1" id="sessions_list">
          {sessions.map((ses) => (
            <div 
              key={ses.id}
              onClick={() => setCurrentSessionId(ses.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                currentSessionId === ses.id 
                  ? `bg-white/5 border-amber-500/20 text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]` 
                  : 'bg-transparent border-transparent hover:bg-white/5 text-white/50 hover:text-white/90'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs font-medium truncate font-sans">{ses.title}</p>
                <span className="text-[9px] text-white/30 font-mono">
                  {new Date(ses.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(ses.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition duration-150"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Built-in controllers */}
        <div className="mt-4 pt-4 border-t border-white/5 space-y-4" id="tab_settings_panel">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-2">COMPANION MODEL</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs text-white/80 font-mono outline-none focus:border-amber-500/50 transition-colors"
            >
              <option value="gemini-3.5-flash" className="bg-[#0a0a0c]">Gemini 3.5 Flash (General)</option>
              <option value="gemini-3.1-pro-preview" className="bg-[#0a0a0c]">Gemini 3.1 Pro (Complex)</option>
              <option value="gemini-3.1-flash-lite" className="bg-[#0a0a0c]">Gemini 3.1 Lite (Fast)</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer group text-xs text-white/50 hover:text-white/80">
              <input 
                type="checkbox" 
                checked={useThinking} 
                onChange={(e) => setUseThinking(e.target.checked)}
                className={`rounded border-white/10 bg-[#0a0a0c] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-[#0a0a0c]`}
              />
              <span className="flex items-center gap-1.5 font-sans">
                <BrainCircuit size={13} className="text-purple-400" />
                Thinking Mode (High Level)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer group text-xs text-white/50 hover:text-white/80">
              <input 
                type="checkbox" 
                checked={useSearchGrounding} 
                onChange={(e) => {
                  setUseSearchGrounding(e.target.checked);
                  if (e.target.checked) setUseMapsGrounding(false);
                }}
                className={`rounded border-white/10 bg-[#0a0a0c] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-[#0a0a0c]`}
              />
              <span className="flex items-center gap-1.5 font-sans">
                <Search size={13} className="text-sky-400" />
                Google Search Grounding
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer group text-xs text-white/50 hover:text-white/80">
              <input 
                type="checkbox" 
                checked={useMapsGrounding} 
                onChange={(e) => {
                  setUseMapsGrounding(e.target.checked);
                  if (e.target.checked) setUseSearchGrounding(false);
                }}
                className={`rounded border-white/10 bg-[#0a0a0c] text-amber-500 focus:ring-amber-500/50 focus:ring-offset-[#0a0a0c]`}
              />
              <span className="flex items-center gap-1.5 font-sans">
                <MapPin size={13} className="text-emerald-400" />
                Google Maps Grounding
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Chat Thread */}
      <div className="lg:col-span-3 bg-black/10 backdrop-blur-sm rounded-2xl border border-white/5 flex flex-col h-full overflow-hidden" id="main_chat_thread_container">
        {/* Thread Header */}
        <div className="p-4 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between" id="chat_header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-orange-300 flex items-center justify-center font-sans font-bold text-black text-sm shadow-[0_0_12px_rgba(245,158,11,0.3)]">
              ❤️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-display font-semibold text-white text-sm tracking-wide">Habibi</h4>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/70 font-mono border border-white/10`}>
                  Exclusively for {nickname || 'Stentuner'}
                </span>
              </div>
              <p className="text-[11px] text-[#d1d1d6]/60 font-sans truncate">
                {isVoiceActive ? '🎙️ Real-time Live Audio Connection active' : 'Witty, loyal, and razor-sharp best friend.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Voice Link Trigger */}
            <button 
              onClick={startLiveVoiceSession}
              disabled={isWsConnecting}
              className={`p-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-xs font-semibold ${
                isVoiceActive 
                  ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-950/40 border border-red-400' 
                  : `bg-white/5 hover:bg-white/10 border border-white/10 text-white`
              }`}
              title={isVoiceActive ? "Disconnect Voice Session" : "Start Live Voice Chat (Live API)"}
            >
              {isVoiceActive ? <MicOff size={15} /> : <Mic size={15} />}
              {isWsConnecting ? 'Connecting...' : isVoiceActive ? 'Voice Live' : 'Live Voice'}
            </button>

            {/* Vocal Synthesis Fallback Toggle */}
            <button 
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`p-2 rounded-xl border transition ${
                ttsEnabled 
                  ? `bg-amber-500/10 border-amber-500/30 text-amber-300` 
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/80'
              }`}
              title={ttsEnabled ? "Speech response read-out enabled" : "Enable speech response fallback"}
            >
              <Volume2 size={15} />
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" id="messages_scroller">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <Sparkles className={`w-8 h-8 text-amber-400 animate-spin`} />
              <p className="text-xs text-[#d1d1d6]/50 font-sans max-w-xs">
                To start, click "New" session on sidebar or type below. Habibi is always here.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end animate-fade-in' : 'items-start'}`}
                >
                  <div className="flex items-end gap-3 max-w-[85%]">
                    {m.role === 'model' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-300 flex items-center justify-center text-xs text-black shadow-[0_0_10px_rgba(245,158,11,0.2)] shrink-0 font-sans font-bold select-none">
                        ❤️
                      </div>
                    )}
                    
                    <div className={`p-4 rounded-2xl border shadow-sm ${
                      m.role === 'user' 
                        ? 'bg-white/5 border-white/10 text-white/90 rounded-br-none rounded-2xl' 
                        : `bg-black/40 border border-white/5 text-[#ffffff] rounded-bl-none rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl`
                    }`}>
                      {/* Thinking mode representation */}
                      {m.role === 'model' && m.thinking && m.thinkingText && (
                        <div className="mb-3 p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] text-white/60 font-mono">
                          <div className="flex items-center gap-1.5 mb-1 text-amber-400 font-bold tracking-wider">
                            <BrainCircuit size={13} />
                            HABIBI'S INTERIOR FLOW:
                          </div>
                          <p className="whitespace-pre-line leading-relaxed">{m.thinkingText}</p>
                        </div>
                      )}

                      <p className="text-xs font-sans leading-relaxed whitespace-pre-wrap select-text selection:bg-amber-500/20">{m.content}</p>

                      {/* Grounding references link */}
                      {m.role === 'model' && m.groundingUrls && m.groundingUrls.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1">
                          <p className="text-[9px] font-mono font-bold text-amber-500/70 flex items-center gap-1 uppercase tracking-widest">
                            <Search size={10} /> Grounded Sources:
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {m.groundingUrls.map((g, i) => (
                              <a
                                key={i}
                                href={g.uri}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline bg-white/5 px-2.5 py-1 rounded border border-white/10 font-mono truncate max-w-[200px] transition-colors"
                              >
                                {g.title || 'Source Links'}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] text-[#d1d1d6]/30 font-mono mt-1 px-1">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {isGenerating && (
            <div className="flex items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-300 flex items-center justify-center text-xs text-black animate-pulse shadow-md">
                ❤️
              </div>
              <div className="bg-white/5 rounded-2xl rounded-bl-none p-3 border border-white/5 text-xs text-white/50 font-sans italic flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-amber-400" />
                Habibi is drawing inspiration...
              </div>
            </div>
          )}

          <div ref={messageEndRef} />
        </div>

        {/* Error reporting line */}
        {errorText && (
          <div className="mx-4 p-2 bg-red-950/20 border border-red-500/20 rounded-xl flex items-center gap-2 text-[11px] text-red-300 font-sans">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <p className="flex-1">{errorText}</p>
            <button onClick={() => setErrorText('')} className="hover:text-white text-slate-400 font-mono font-bold px-1.5 rounded">×</button>
          </div>
        )}

        {/* Input box styled with Immersive UI */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-black/10 flex flex-col gap-2" id="chat_composer_form">
          {/* File attachment preview */}
          {attachmentBase64 && (
            <div className="bg-white/5 p-2 rounded-xl flex items-center justify-between border border-white/10 max-w-xs">
              <div className="flex items-center gap-2 overflow-hidden">
                <img 
                  src={`data:${attachmentMimeType};base64,${attachmentBase64}`} 
                  alt="Attachment Preview" 
                  className="w-10 h-10 object-cover rounded-lg border border-white/10" 
                />
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50 font-sans truncate">Attached image</p>
                  <p className="text-[9px] text-white/30 font-mono uppercase truncate">{attachmentMimeType}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={clearAttachment}
                className="text-white/40 hover:text-red-400 font-mono font-bold text-xs p-1"
              >
                ×
              </button>
            </div>
          )}

          <div className="relative flex items-center bg-white/5 border border-white/10 rounded-full py-1.5 pl-4 pr-1.5 focus-within:border-amber-500/50 backdrop-blur-md transition-all">
            {/* Image attachment pick button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white/90 transition shrink-0"
              title="Attach image for Habibi to analyze"
            >
              <Paperclip size={16} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Talk to me, habibi..."
              disabled={isGenerating || !currentSessionId}
              className="flex-grow bg-transparent border-none outline-none py-2 px-3 text-xs text-white/90 placeholder-white/20 focus:ring-0 min-w-0"
            />

            <button
              type="submit"
              disabled={isGenerating || (!inputText.trim() && !attachmentBase64) || !currentSessionId}
              className={`font-semibold px-4 py-2 rounded-full text-xs transition-all uppercase tracking-wider shrink-0 cursor-pointer ${
                (inputText.trim() || attachmentBase64) && !isGenerating && currentSessionId
                  ? `bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]`
                  : 'bg-white/5 text-white/20'
              }`}
            >
              SEND
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
