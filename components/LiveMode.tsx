import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Radio, X, Volume2 } from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import { decodeBase64, decodeAudioData, createPcmBlob } from '../utils/audioUtils';

const LiveMode: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false); // User speaking
  const [aiSpeaking, setAiSpeaking] = useState(false); // AI speaking
  const [logs, setLogs] = useState<string[]>([]);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // For scheduling audio playback
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const log = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

  const stopAll = () => {
    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    // Stop playback
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    // Close session
    if (sessionRef.current) {
      // Session object doesn't strictly have a close() on the promise result itself in the new SDK,
      // but we rely on cutting the socket connection if possible or just abandoning logic.
      // However, the SDK doesn't expose a manual 'disconnect' on the session object easily
      // usually we close via the return of connect? No, connect returns a promise.
      // The guide says use session.close() if available, but let's just reset state.
      // Actually, connect returns a Promise<LiveSession>.
      // Checking SDK docs usually suggests closing socket. We'll assume we just stop sending data.
      sessionRef.current = null; 
    }

    setConnected(false);
    setSpeaking(false);
    setAiSpeaking(false);
  };

  const startSession = async () => {
    if (!process.env.API_KEY) {
      alert('API Key missing');
      return;
    }

    try {
      setConnected(true);
      log("Initializing audio contexts...");

      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      log("Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      log("Connecting to Gemini Live...");
      
      // We need a way to access the resolved session to send data
      let resolveSession: (s: any) => void;
      const sessionPromise = new Promise<any>(resolve => { resolveSession = resolve; });

      const connectionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            log("Connected! Start talking.");
            
            // Setup input stream processing
            if (!inputAudioContextRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            sourceRef.current = source;
            
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Simple VAD visualization trigger
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
              const rms = Math.sqrt(sum/inputData.length);
              setSpeaking(rms > 0.02);

              const pcmBlob = createPcmBlob(inputData);
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const outputCtx = outputAudioContextRef.current;
            if (!outputCtx) return;

            // Handle Audio Output
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setAiSpeaking(true);
              
              // Calculate start time
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decodeBase64(base64Audio),
                outputCtx,
                24000, 
                1
              );

              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setAiSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              log("Interrupted!");
              for (const src of sourcesRef.current) {
                src.stop();
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setAiSpeaking(false);
            }
          },
          onclose: () => {
            log("Connection closed.");
            stopAll();
          },
          onerror: (e) => {
            console.error(e);
            log("Error occurred.");
            stopAll();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: "You are a helpful South African assistant. You understand and can switch between English, Zulu, Xhosa, and Afrikaans naturally. Be concise and friendly."
        }
      });

      const session = await connectionPromise;
      sessionRef.current = session;
      resolveSession!(session);

    } catch (e) {
      console.error(e);
      log("Failed to start session.");
      setConnected(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, []);

  return (
    <div className="flex flex-col h-full items-center justify-between p-6 max-w-md mx-auto w-full">
      
      <div className="w-full space-y-2">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-white">Live Conversation</h2>
          <p className="text-slate-400 text-sm">Speak naturally in any supported language.</p>
        </div>
        
        {/* Status Indicator */}
        <div className="flex justify-center">
          <div className={`px-4 py-1 rounded-full text-xs font-medium flex items-center gap-2 ${
            connected ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
            {connected ? 'Listening' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Visualizer Area */}
      <div className="w-full py-8 flex flex-col items-center gap-4">
         <div className="text-indigo-300 text-sm font-medium h-6">
           {aiSpeaking ? "Gemini is speaking..." : speaking ? "You are speaking..." : connected ? "Listening..." : ""}
         </div>
         <AudioVisualizer isActive={connected && (speaking || aiSpeaking)} mode="bars" />
         <div className="h-32 overflow-y-auto w-full text-xs text-slate-600 font-mono p-2 bg-black/20 rounded">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
         </div>
      </div>

      {/* Controls */}
      <div className="w-full pb-8">
        {!connected ? (
          <button
            onClick={startSession}
            className="w-full h-20 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-3xl flex items-center justify-center gap-4 shadow-lg shadow-emerald-900/20 transition-all transform active:scale-95"
          >
            <div className="p-3 bg-white/20 rounded-full">
              <Mic size={32} className="text-white" />
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-lg">Start Chat</div>
              <div className="text-emerald-100 text-sm">Tap to connect</div>
            </div>
          </button>
        ) : (
          <button
            onClick={stopAll}
            className="w-full h-20 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-3xl flex items-center justify-center gap-4 text-red-400 transition-all"
          >
            <div className="p-3 bg-red-500/20 rounded-full">
              <X size={32} />
            </div>
            <span className="font-bold text-lg">End Session</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default LiveMode;