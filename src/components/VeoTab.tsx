import React, { useState, useEffect, useRef } from 'react';
import { PlayCircle, Video, Sliders, RefreshCw, AlertCircle, Download, Sparkles, HelpCircle, Film } from 'lucide-react';

interface VeoTabProps {
  themeColor: string;
}

const REASSURING_MESSAGES = [
  "Drafting conceptual storyboards...",
  "Initializing three-dimensional motion coefficients...",
  "Calibrating lighting rays and particle gradients...",
  "Synthesizing keyframe vector interpolations...",
  "Optimizing texture depth and resolution buffers...",
  "Almost finished! Habibi is putting the ultimate directorial touches on your movie..."
];

export const VeoTab: React.FC<VeoTabProps> = ({ themeColor }) => {
  const [prompt, setPrompt] = useState('A majestic brass turtle gliding gracefully through a cosmic nebula, volumetric star dust trails, dreamy sci-fi synthwave aesthetics');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  
  const [loading, setLoading] = useState(false);
  const [currentLoaderMessageIndex, setCurrentLoaderMessageIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Polling tracker
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTextIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  const clearAllTimers = () => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (loadingTextIntervalRef.current) clearInterval(loadingTextIntervalRef.current);
  };

  const handleCreateVideo = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setVideoUrl(null);
    setCurrentLoaderMessageIndex(0);

    // Setup reassuring loader text cycler
    loadingTextIntervalRef.current = setInterval(() => {
      setCurrentLoaderMessageIndex((prev) => (prev + 1) % REASSURING_MESSAGES.length);
    }, 12000);

    try {
      // Step 1: Start video generation request
      const initRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          resolution
        })
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || 'Failed to start video storyboard');
      }

      const { operationName } = await initRes.json();
      if (!operationName) {
        throw new Error("Initialization returned an empty operation token. Try checking your prompt bounds.");
      }

      // Step 2: Begin poll cycle
      pollVideoStatus(operationName);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate visual video stream.');
      setLoading(false);
      clearAllTimers();
    }
  };

  const pollVideoStatus = (operationName: string) => {
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const checkRes = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName })
        });

        if (!checkRes.ok) {
          throw new Error('Server connection lost during clip processing.');
        }

        const data = await checkRes.json();

        if (data.error) {
          throw new Error(data.error.message || 'Veo server returned simulation error.');
        }

        if (data.done) {
          clearAllTimers();
          
          // Complete: download the video blob proxy
          await downloadVideoBlobAndMount(operationName);
        }

      } catch (err: any) {
        console.error('Error polling status:', err);
        setErrorMsg(err.message || 'Polling video failed.');
        setLoading(false);
        clearAllTimers();
      }
    }, 7000); // Poll every 7 seconds
  };

  const downloadVideoBlobAndMount = async (operationName: string) => {
    try {
      const fetchRes = await fetch('/api/video-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName })
      });

      if (!fetchRes.ok) {
        throw new Error('Video proxy download failed.');
      }

      const blob = await fetchRes.blob();
      const objUrl = URL.createObjectURL(blob);
      setVideoUrl(objUrl);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to download video stream from Google servers.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadMp4 = () => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `habibi-veo-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] animate-fade-in" id="veo_tab_root">
      {/* Parameters Controls */}
      <div className="lg:col-span-4 bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5 flex flex-col justify-between h-full shadow-xl" id="veo_controls">
        <div className="space-y-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 flex items-center gap-1.5">
            <Video size={15} /> VEO MOVIE RIG
          </h3>

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">CINEMATIC RESOLUTION</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as any)}
              className="w-full bg-[#0a0a0c]/85 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 transition-all outline-none"
            >
              <option value="1080p">Veo 3.1 1080p High-Gen</option>
              <option value="720p">Veo 3.1 720p Fast-Gen</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">FILM ASPECT RATIO</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`cursor-pointer py-2 border rounded-xl text-3xs font-mono font-semibold transition flex flex-col items-center justify-center gap-1 ${
                  aspectRatio === '16:9'
                    ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                    : 'border-white/5 bg-white/2 text-white/40 hover:text-white/80'
                }`}
              >
                <span>16 : 9</span>
                <span className="text-[9px] font-sans text-white/30">Landscape (Widescreen)</span>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`cursor-pointer py-2 border rounded-xl text-3xs font-mono font-semibold transition flex flex-col items-center justify-center gap-1 ${
                  aspectRatio === '9:16'
                    ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                    : 'border-white/5 bg-white/2 text-white/40 hover:text-white/80'
                }`}
              >
                <span>9 : 16</span>
                <span className="text-[9px] font-sans text-white/30">Portrait (Social Canvas)</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-[10px] text-white/40 font-semibold tracking-wide uppercase leading-relaxed">
            📁 Cinematic videos are rendered on Google supercomputers. Story compilation could take from 2 to 4 minutes depending on queue volume. Reassuring logs will stream on the rig while rendering!
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button
            onClick={handleCreateVideo}
            disabled={loading || !prompt.trim()}
            className="cursor-pointer w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider transition duration-200 flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Film size={14} />}
            {loading ? 'GENERATING STORYBOARD...' : 'LAUNCH NEURAL DIRECTING'}
          </button>
        </div>
      </div>

      {/* Stage Area */}
      <div className="lg:col-span-8 flex flex-col justify-between h-full bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 p-5 shadow-lg" id="veo_stage">
        <div className="flex-grow flex flex-col gap-4 overflow-hidden">
          <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">
            CINEMATIC MOVIE SCREEN
          </h4>

          {errorMsg && (
            <div className="p-3 bg-red-950/40 border border-red-500/20 rounded-2xl flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={15} /> {errorMsg}
            </div>
          )}

          <div className="flex-grow bg-black/35 border border-white/5 rounded-xl overflow-hidden flex items-center justify-center relative">
            {loading ? (
              <div className="text-center p-6 space-y-4">
                <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                  <span className="absolute w-full h-full rounded-full border-4 border-white/5 border-t-amber-500 animate-spin"></span>
                  <Film size={18} className="text-amber-400 shrink-0" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">
                    RENDERING CINEMATICS
                  </p>
                  <p className="text-[11px] text-amber-300 font-sans italic animate-pulse transition duration-500">
                    "{REASSURING_MESSAGES[currentLoaderMessageIndex]}"
                  </p>
                </div>
              </div>
            ) : videoUrl ? (
              <video 
                src={videoUrl}
                controls 
                autoPlay 
                loop 
                className="max-w-full max-h-full object-contain"
                id="veo_player_elem"
              />
            ) : (
              <div className="text-center p-6 space-y-2">
                <PlayCircle className="w-10 h-10 text-white/10 mx-auto" />
                <p className="text-xs text-white/30 font-sans leading-relaxed max-w-sm uppercase tracking-wider text-[10px] font-bold">
                  Describe a motion scenery in the typewriter box, choose your frame ratio, and let Veo build your cinematographic vision.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Input prompt - lower rig */}
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">PROMPT STORYBOARD DESCRIPTION</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cosmic astronaut floating on..."
              disabled={loading}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 outline-none transition-all font-sans"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            {videoUrl && !loading ? (
              <button
                onClick={handleDownloadMp4}
                className="py-3 px-4 rounded-full border border-dashed border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-amber-400 hover:text-white transition flex items-center justify-center gap-1.5 w-full h-[38.5px] uppercase tracking-wider"
              >
                <Download size={13} /> Save MP4 Clip
              </button>
            ) : (
              <div className="text-white/20 text-[10px] font-mono leading-tight py-3 w-full text-center uppercase tracking-[0.2em] font-bold">
                VEO GRAPHICS Rig READY
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
