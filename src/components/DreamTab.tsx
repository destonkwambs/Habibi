import React, { useState, useRef, useEffect } from 'react';
import { Image, Sliders, RefreshCw, AlertCircle, Download, Sparkles, Paintbrush, Undo, Check, Trash2, Camera } from 'lucide-react';

interface DreamTabProps {
  themeColor: string;
}

export const DreamTab: React.FC<DreamTabProps> = ({ themeColor }) => {
  const [prompt, setPrompt] = useState('An elegant vintage typewriter sitting on a warm wooden desk next to a cup of espresso, dramatic side light, highly detailed 8k');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [selectedModel, setSelectedModel] = useState<'gemini-3-pro-image-preview' | 'gemini-3.1-flash-image-preview'>('gemini-3-pro-image-preview');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [textRef, setTextRef] = useState('');

  // Canvas / Upload Editing States
  const [uploadBase64, setUploadBase64] = useState<string | null>(null);
  const [uploadMime, setUploadMime] = useState<string>('image/jpeg');
  const [brushColor, setBrushColor] = useState('#ff0055');
  const [brushWidth, setBrushWidth] = useState(12);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Canvas when uploaded image changes or Drawing mode toggles
  useEffect(() => {
    if (uploadBase64 && canvasRef.current) {
      renderUploadedImage();
    }
  }, [uploadBase64, isDrawingMode]);

  const renderUploadedImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.src = `data:${uploadMime};base64,${uploadBase64}`;
    img.onload = () => {
      // Fit image onto canvas bounding
      canvas.width = 512;
      canvas.height = 512 * (img.height / img.width);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadMime(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        setUploadBase64(base64);
        setIsDrawingMode(true);
        // Switch to gemini-3.1-flash-image-preview since it excels at prompt image edits
        setSelectedModel('gemini-3.1-flash-image-preview');
      }
    };
    reader.readAsDataURL(file);
  };

  // Drawing handlers on the Canvas
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !canvasRef.current) return;
    isDrawingRef.current = true;
    draw(e);
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.beginPath(); // reset path
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Relative mouse vector in canvas bounds
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    ctx.lineWidth = brushWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = brushColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    if (uploadBase64) {
      renderUploadedImage();
    } else if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const resetAllEditState = () => {
    setUploadBase64(null);
    setIsDrawingMode(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedModel('gemini-3-pro-image-preview');
  };

  // Trigger Imagen generate on our secure Fullstack controller
  const handleGenerateDream = async () => {
    if (!prompt.trim() && !uploadBase64) return;

    setLoading(true);
    setErrorMsg('');
    setGeneratedImgUrl(null);
    setTextRef('');

    try {
      let finalBase64 = null;
      if (isDrawingMode && canvasRef.current) {
        // Retrieve the current drawing composite from canvas
        finalBase64 = canvasRef.current.toDataURL('image/png').split(',')[1];
      } else if (uploadBase64) {
        finalBase64 = uploadBase64;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          aspectRatio,
          imageSize: selectedModel === 'gemini-3-pro-image-preview' ? imageSize : undefined,
          base64Image: finalBase64 || undefined,
          mimeType: finalBase64 ? 'image/png' : undefined
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server error generating dream');
      }

      const data = await res.json();

      if (data.imageBase64) {
        setGeneratedImgUrl(`data:image/png;base64,${data.imageBase64}`);
      }
      
      if (data.text) {
        setTextRef(data.text);
      }

      if (!data.imageBase64 && !data.text) {
        throw new Error("No image data or description was returned from the model. Please check your prompt description!");
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Dream Canvas creation failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImgUrl) return;
    const link = document.createElement('a');
    link.href = generatedImgUrl;
    link.download = `habibi-dream-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]" id="dream_tab_root">
      {/* LEFT COLUMN: Controls Config Panel - spans 4 cols */}
      <div className="lg:col-span-4 bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/5 flex flex-col justify-between h-full shadow-xl" id="config_params_panel">
        <div className="space-y-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 flex items-center gap-1.5">
            <Sliders size={15} /> IMAGEN ENGINE SETUP
          </h3>

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">IMAGE OR MODEL TARGET</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as any)}
              className="w-full bg-[#0a0a0c]/85 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white/95 focus:border-amber-500/50 transition-all outline-none"
            >
              <option value="gemini-3-pro-image-preview">Gemini 3 Pro (High Quality Generative)</option>
              <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash (Image Editor & Fast)</option>
            </select>
          </div>

          {/* Render imageSize option only if gemini-3-pro-image-preview */}
          {selectedModel === 'gemini-3-pro-image-preview' && (
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">SPECIFY RESOLUTION SIZE</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1K', '2K', '4K'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setImageSize(size)}
                    className={`cursor-pointer py-2 border rounded-xl text-2xs font-mono font-semibold transition ${
                      imageSize === size
                        ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                        : 'border-white/5 bg-white/2 text-white/40 hover:text-white/80'
                    }`}
                  >
                    {size} ({size === '1K' ? '1024px' : size === '2K' ? '2048px' : '4096px'})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">ASPECT RATIO</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['1:1', '3:4', '4:3', '9:16', '16:9'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`cursor-pointer py-1.5 border rounded-xl text-3xs font-mono font-semibold transition ${
                    aspectRatio === ratio
                      ? `bg-amber-500/10 border-amber-500/50 text-amber-300`
                      : 'border-white/5 bg-white/2 text-white/40 hover:text-white/80'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Edit / Upload image module */}
          <div className="pt-3 border-t border-white/10">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-2 flex items-center gap-1">
              <Camera size={12} /> Image Editing Suite
            </h4>

            {!uploadBase64 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-5 rounded-2xl border border-dashed border-white/10 bg-white/2 hover:bg-white/5 text-white/30 hover:text-white/60 transition flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera size={18} className="text-white/40" />
                <span className="text-[11px] font-semibold">Upload Photo to Edit</span>
                <span className="text-[9px] font-mono tracking-wider">JPG, PNG up to 10MB</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 font-mono uppercase tracking-wide">
                    <Check size={11} /> Photo Uploaded
                  </span>
                  <button 
                    onClick={resetAllEditState}
                    className="text-[10px] text-red-450 hover:text-red-400 transition flex items-center gap-1 font-bold uppercase tracking-wide"
                  >
                    <Trash2 size={11} /> Reset Edit
                  </button>
                </div>

                {/* Drawing Color pickers */}
                <div className="grid grid-cols-2 gap-2.5 p-3 bg-white/5 border border-white/10 rounded-xl">
                  <div>
                    <label className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1">BRUSH COLOR</label>
                    <input 
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-full bg-transparent h-6 rounded cursor-pointer border-none outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1">BRUSH WIDTH ({brushWidth}px)</label>
                    <input 
                      type="range"
                      min="2"
                      max="40"
                      value={brushWidth}
                      onChange={(e) => setBrushWidth(Number(e.target.value))}
                      className="w-full h-6 accent-amber-500 bg-transparent rounded"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="flex-1 py-1.5 px-3 rounded-lg border border-white/10 bg-white/5 text-[10px] font-semibold text-white/60 hover:text-white transition"
                  >
                    Clear Drawing
                  </button>
                </div>
              </div>
            )}
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleUploadFile}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        {/* Action triggers */}
        <div className="pt-4 border-t border-white/10">
          <button
            onClick={handleGenerateDream}
            disabled={loading || (!prompt.trim() && !uploadBase64)}
            className="cursor-pointer w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-black font-bold text-xs tracking-wider rounded-xl transition duration-200 flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'WEAVING YOUR DREAM...' : uploadBase64 ? 'APPLY IMAGE EDIT PROMPT' : 'GENERATE CUSTOM DREAM'}
          </button>
        </div>
      </div>

      {/* RIGHT STAGE: Creative Viewport - spans 8 cols */}
      <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden" id="creative_workspace_viewport">
        {/* Sub-view: INPUT/WORKSPACE PROMPT & CANVAS DRAWING */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 p-5 flex flex-col justify-between h-full overflow-hidden shadow-lg" id="canvas_and_description_prompt">
          <div className="flex flex-col h-full gap-3">
            <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">
              {uploadBase64 ? 'ACTIVE DRAWING CANVAS (EDITING SUITE)' : 'IMAGE DREAM INSPIRATION'}
            </h4>

            <div className="flex-1">
              {!uploadBase64 ? (
                <div className="w-full h-full p-4 bg-black/20 rounded-xl border border-white/5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold block mb-1.5">PROMPT DESCRIPTION</label>
                  <textarea
                    rows={8}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what Habibi should paint..."
                    className="w-full bg-transparent border-none outline-none text-xs text-white/90 p-1 font-sans leading-relaxed resize-none h-full"
                  />
                </div>
              ) : (
                <div className="w-full h-[320.5px] bg-black/35 rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onMouseMove={draw}
                    className="max-w-full max-h-full aspect-square border border-white/10 bg-black rounded-xl cursor-crosshair shadow-lg"
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-[10px] text-white/40 font-semibold tracking-wide uppercase leading-relaxed">
              💡 {uploadBase64 
                ? 'Draw directly above with your mouse to mask / highlight, then describe how you want Habibi to transform or edit the image.' 
                : 'Imagen renders the highest level of visual craft. Try entering atmospheric textures like dramatic side lightning, retro polaroids, volumetric shadows, or concept vector sketches.'}
            </div>
          </div>
        </div>

        {/* Sub-view: GENERATED DREAM RESULT STAGE */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 p-5 flex flex-col justify-between h-full overflow-hidden shadow-lg" id="stage_generated_output">
          <div className="flex flex-col flex-1 gap-4 overflow-hidden relative">
            <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">
              HABIBI'S GENERATION STAGE
            </h4>

            {errorMsg && (
              <div className="p-3 bg-red-950/40 border border-red-500/25 rounded-2xl flex items-center gap-2.5 text-xs text-red-300">
                <AlertCircle size={15} className="shrink-0 text-red-400" />
                <p>{errorMsg}</p>
              </div>
            )}

            <div className="flex-1 bg-black/30 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden relative">
              {loading ? (
                <div className="text-center space-y-3">
                  <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mx-auto" />
                  <p className="text-xs text-white/50 font-sans italic">"Crafting your vision, habibi..."</p>
                </div>
              ) : generatedImgUrl ? (
                <img 
                  src={generatedImgUrl} 
                  alt="Habibi Generated Dream" 
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : textRef ? (
                <div className="p-4 overflow-y-auto max-h-full text-xs font-sans text-white/90 leading-relaxed whitespace-pre-wrap select-text">
                  {textRef}
                </div>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <Image className="w-9 h-9 text-white/20 mx-auto" />
                  <p className="text-xs text-white/30 font-sans leading-relaxed max-w-xs uppercase tracking-wider text-[10px] font-bold">
                    Your generated visual masterpiece will mount in this frame. Ready to materialize!
                  </p>
                </div>
              )}
            </div>

            {/* Optional action panel once image is done */}
            {generatedImgUrl && !loading && (
              <button
                onClick={downloadImage}
                className="py-3 px-4 rounded-full border border-dashed border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-amber-400 hover:text-white transition flex items-center justify-center gap-1.5 uppercase tracking-wider"
              >
                <Download size={13} /> Save Image Asset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
