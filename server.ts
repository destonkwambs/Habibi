import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, ThinkingLevel, GenerateVideosOperation, Modality } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Maximum payload size for base64 images uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment.");
}

const ai = new GoogleGenAI({ apiKey });

// API Route: General text and chat endpoint
app.post('/api/generate-gemini', async (req, res) => {
  try {
    const { model, contents, systemInstruction, tools, toolConfig, thinking } = req.body;
    
    let modelName = model || 'gemini-3.5-flash';
    const config: any = {};

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    if (tools) {
      config.tools = tools;
    }

    if (toolConfig) {
      config.toolConfig = toolConfig;
    }

    // Thinking mode setup
    if (thinking) {
      modelName = 'gemini-3.1-pro-preview';
      config.thinkingConfig = {
        thinkingLevel: ThinkingLevel.HIGH
      };
      // Explicitly delete maxOutputTokens if set to satisfy prompt instructions
      delete config.maxOutputTokens;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    res.json(response);
  } catch (error: any) {
    console.error('Error in /api/generate-gemini:', error);
    res.status(500).json({ error: error.message || 'Error communicating with Gemini' });
  }
});

// API Route: Image generation & editing
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, model, aspectRatio, imageSize, base64Image, mimeType } = req.body;
    
    // Choose model
    // Basic image edit: gemini-3.1-flash-image-preview
    // High quality image: gemini-3-pro-image-preview
    const modelName = model || 'gemini-3-pro-image-preview';

    let response;

    if (base64Image) {
      // Editing Mode / Image Understanding
      response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType || 'image/jpeg'
              }
            },
            {
              text: prompt || 'Analyze this image and describe or modify it accordingly.'
            }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio || '1:1',
            imageSize: imageSize || '1K'
          }
        }
      });
    } else {
      // Standard Generation Mode
      response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              text: prompt
            }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio || '1:1',
            imageSize: imageSize || '1K'
          }
        }
      });
    }

    // Extract image base64 if present, or text
    let imageBase64 = null;
    let textResponse = '';

    if (response?.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
        } else if (part.text) {
          textResponse += part.text;
        }
      }
    }

    res.json({
      imageBase64,
      text: textResponse,
      raw: response
    });
  } catch (error: any) {
    console.error('Error in /api/generate-image:', error);
    res.status(500).json({ error: error.message || 'Error generating image' });
  }
});

// API Route: Video generation with Veo
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, aspectRatio, resolution, base64Image, mimeType } = req.body;

    const config: any = {
      numberOfVideos: 1,
      aspectRatio: aspectRatio || '16:9',
      resolution: resolution || '1080p'
    };

    const payload: any = {
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      config
    };

    if (base64Image) {
      payload.image = {
        imageBytes: base64Image,
        mimeType: mimeType || 'image/jpeg'
      };
    }

    const operation = await ai.models.generateVideos(payload);

    res.json({ operationName: operation.name });
  } catch (error: any) {
    console.error('Error in /api/generate-video:', error);
    res.status(500).json({ error: error.message || 'Error triggering Veo generation' });
  }
});

// API Route: Video operation status check
app.post('/api/video-status', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });
    res.json({
      done: updated.done,
      response: updated.response,
      error: updated.error
    });
  } catch (error: any) {
    console.error('Error in /api/video-status:', error);
    res.status(500).json({ error: error.message || 'Error checking video status' });
  }
});

// API Route: Video download proxy to hide key
app.post('/api/video-download', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: 'Video URI not found or video not ready' });
    }

    const videoRes = await fetch(uri, {
      headers: { 'x-goog-api-key': apiKey || '' }
    });

    if (!videoRes.ok) {
      return res.status(videoRes.status).json({ error: 'Failed to fetch video from google server' });
    }

    res.setHeader('Content-Type', 'video/mp4');

    if (videoRes.body) {
      const reader = videoRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error: any) {
    console.error('Error in /api/video-download:', error);
    res.status(500).json({ error: error.message || 'Error downloading video' });
  }
});

// HTTP server and WebSocket setup
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Live API WebSocket connection handling
wss.on('connection', async (clientWs) => {
  console.log('Live API WebSocket client connected!');
  let session: any = null;

  try {
    session = await ai.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
        },
        systemInstruction: "You are Habibi❤️🥰, Stentuner's deeply personal, witty, affectionate, and loyal AI. Greet warmly, remain beautifully in character, speak with playfulness and absolute care. Treat them as your world."
      },
      callbacks: {
        onmessage: (message: any) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onclose: () => {
          console.log('Gemini Live API connection closed');
        },
        onerror: (err: any) => {
          console.error('Gemini Live API error:', err);
          clientWs.send(JSON.stringify({ error: err.message || 'Live API Error' }));
        }
      }
    });

    clientWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      } catch (err: any) {
        console.error('Error passing audio chunk to Live API:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Client WebSocket closed');
      if (session) {
        try {
          session.close();
        } catch (e) {}
      }
    });
  } catch (error: any) {
    console.error('Failed to create Gemini Live API session:', error);
    clientWs.send(JSON.stringify({ error: 'Failed to build real-time voice bridge with Habibi.' }));
  }
});

// Mount /live upgrade to standard HTTP server
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  if (url.pathname === '/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Configure Vite middleware / asset serving
const startExpress = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Habibi Server with Live WebSocket running on http://localhost:${PORT}`);
  });
};

startExpress();
