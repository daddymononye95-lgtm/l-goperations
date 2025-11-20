
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Play, Loader2, Copy, RefreshCw, Settings2, Wifi, WifiOff, Download, Check, Globe, Minimize2, Maximize2, Pause, Square, ExternalLink, Clipboard } from 'lucide-react';
import { SALanguage, LANGUAGE_VOICE_MAP, GEMINI_VOICES, INITIAL_OFFLINE_PACKS, OfflinePack } from '../types';
import { decodeBase64, decodeAudioData } from '../utils/audioUtils';

interface TTSModeProps {
  onPasteFromClipboard?: () => void;
  onFloatingChange?: (isFloating: boolean) => void;
}

const TTSMode: React.FC<TTSModeProps> = ({ onPasteFromClipboard, onFloatingChange }) => {
  // Core State
  const [text, setText] = useState('');
  const [selectedLang, setSelectedLang] = useState<SALanguage>(SALanguage.ENGLISH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(LANGUAGE_VOICE_MAP[SALanguage.ENGLISH]);
  const [showLangManager, setShowLangManager] = useState(false);
  const [offlinePacks, setOfflinePacks] = useState<OfflinePack[]>(INITIAL_OFFLINE_PACKS);
  
  // Advanced Features
  const [isFloating, setIsFloating] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle Floating State
  useEffect(() => {
    onFloatingChange?.(isFloating);
  }, [isFloating, onFloatingChange]);

  // Update default voice when language changes
  useEffect(() => {
    if (!isOfflineMode) {
      setSelectedVoiceId(LANGUAGE_VOICE_MAP[selectedLang]);
    }
  }, [selectedLang, isOfflineMode]);

  // Apply speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [audioUrl, playbackSpeed]);

  // Handle "Share to Speak" (URL Params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('title');
    if (sharedText) {
      setText(sharedText);
      // Remove param from URL without reload to prevent loop
      window.history.replaceState({}, '', window.location.pathname);
      if (autoSpeak) {
        setTimeout(() => handleGenerate(sharedText), 500);
      }
    }
  }, [autoSpeak]);

  // Smart Clipboard Monitor (Auto-check on focus)
  useEffect(() => {
    const handleFocus = async () => {
      if (!autoSpeak) return;
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText !== text && clipText.length < 5000) {
          // Simple heuristic: if clipboard changed and is reasonable length
          setText(clipText);
        }
      } catch (e) {
        // Silent fail - permission might be denied
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [text, autoSpeak]);

  const handleGenerate = async (inputText = text) => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setIsPlaying(true);

    // Cancel any current browser speech
    window.speechSynthesis.cancel();

    try {
      if (isOfflineMode) {
        await handleOfflineGenerate(inputText);
      } else {
        await handleOnlineGenerate(inputText);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate speech');
      setIsPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineGenerate = async (inputText: string) => {
    const pack = offlinePacks.find(p => p.language === selectedLang);
    if (pack && !pack.downloaded) {
      throw new Error(`Please download the ${selectedLang} language pack first.`);
    }

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(inputText);
      
      const voices = window.speechSynthesis.getVoices();
      const locale = pack?.localeCode || 'en-US';
      const voice = voices.find(v => v.lang === locale) || 
                    voices.find(v => v.lang.startsWith(locale.split('-')[0]));
      
      if (voice) utterance.voice = voice;
      
      utterance.rate = playbackSpeed;
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        setLoading(false);
        setIsPlaying(false);
        resolve();
      };
      
      utterance.onerror = (e) => {
        reject(new Error('Offline speech synthesis failed'));
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const handleOnlineGenerate = async (inputText: string) => {
    if (!process.env.API_KEY) {
      throw new Error('API Key missing');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: {
        parts: [{ text: inputText }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: selectedVoiceId
            }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
      const wavBlob = bufferToWav(audioBuffer, 24000);
      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);
    } else {
      throw new Error('No audio data returned');
    }
  };

  const handleDownloadPack = (id: string) => {
    setOfflinePacks(prev => prev.map(p => {
      if (p.id === id) return { ...p, downloaded: true };
      return p;
    }));
  };

  const handlePaste = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      setText(clipText);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  // --- Mini Player Render ---
  if (isFloating) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-end p-4">
        <div className="pointer-events-auto bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-sm mx-auto overflow-hidden animate-in slide-in-from-bottom-10">
          
          {/* Mini Header */}
          <div className="flex items-center justify-between p-3 bg-slate-800">
             <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
               <Minimize2 size={14} />
               <span>Mini Mode</span>
             </div>
             <button onClick={() => setIsFloating(false)} className="p-1 hover:bg-slate-700 rounded text-slate-400">
               <Maximize2 size={16} />
             </button>
          </div>

          {/* Mini Content */}
          <div className="p-4 space-y-3">
            {isPlaying ? (
              <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-slate-200">Speaking...</span>
                </div>
                <button 
                  onClick={stopPlayback} 
                  className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => handleGenerate(text)}
                disabled={!text}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2"
              >
                <Play size={16} fill="currentColor" /> Speak Current Text
              </button>
            )}
            
            <div className="flex gap-2">
              <button onClick={handlePaste} className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg flex items-center justify-center gap-2 hover:bg-slate-700">
                <Clipboard size={12} /> Paste & Read
              </button>
              <button onClick={() => setText('')} className="px-3 py-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Full UI Render ---
  return (
    <>
      <div className="flex flex-col h-full p-4 space-y-4 max-w-md mx-auto w-full relative">
        
        {/* Mode Toggle & Settings Header */}
        <div className="flex items-center justify-between bg-slate-800 p-2 rounded-xl">
           <div className="flex items-center gap-2 px-2">
              {isOfflineMode ? <WifiOff size={16} className="text-slate-400" /> : <Wifi size={16} className="text-emerald-400" />}
              <span className={`text-xs font-bold ${isOfflineMode ? 'text-slate-400' : 'text-emerald-400'}`}>
                {isOfflineMode ? 'Offline Mode' : 'Gemini Online'}
              </span>
           </div>
           <div className="flex gap-1">
             <button 
                onClick={() => setIsFloating(true)}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400"
                title="Mini Mode (for Split Screen)"
              >
                <Minimize2 size={18} />
             </button>
             <button 
               onClick={() => setShowSettings(!showSettings)}
               className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}
             >
               <Settings2 size={18} />
             </button>
           </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
             
             {/* Online/Offline Switch */}
             <div className="flex items-center justify-between pb-4 border-b border-slate-700">
               <label className="text-sm text-slate-300">Use Offline Mode</label>
               <button 
                 onClick={() => setIsOfflineMode(!isOfflineMode)}
                 className={`w-12 h-6 rounded-full relative transition-colors ${isOfflineMode ? 'bg-indigo-500' : 'bg-slate-600'}`}
               >
                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isOfflineMode ? 'left-7' : 'left-1'}`} />
               </button>
             </div>

              {/* Auto Speak Toggle */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-700">
               <div className="space-y-1">
                 <label className="text-sm text-slate-300 block">Smart Auto-Read</label>
                 <span className="text-xs text-slate-500">Speak when opened from Share/Clipboard</span>
               </div>
               <button 
                 onClick={() => setAutoSpeak(!autoSpeak)}
                 className={`w-12 h-6 rounded-full relative transition-colors ${autoSpeak ? 'bg-indigo-500' : 'bg-slate-600'}`}
               >
                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoSpeak ? 'left-7' : 'left-1'}`} />
               </button>
             </div>

             {/* Speed Control */}
             <div>
               <div className="flex justify-between text-xs text-slate-400 mb-2">
                 <span>Speed</span>
                 <span>{playbackSpeed}x</span>
               </div>
               <input 
                 type="range" 
                 min="0.5" 
                 max="2" 
                 step="0.1"
                 value={playbackSpeed}
                 onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                 className="w-full accent-indigo-500 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer"
               />
             </div>

             {/* Voice Selection (Online Only) */}
             {!isOfflineMode && (
               <div>
                 <label className="block text-xs text-slate-400 mb-2">Gemini Voice</label>
                 <select 
                   value={selectedVoiceId}
                   onChange={(e) => setSelectedVoiceId(e.target.value)}
                   className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2 outline-none focus:border-indigo-500"
                 >
                   {Object.values(GEMINI_VOICES).map(voice => (
                     <option key={voice.id} value={voice.id}>
                       {voice.name} ({voice.gender}) - {voice.description}
                     </option>
                   ))}
                 </select>
               </div>
             )}

             {/* Offline Packs Button */}
             <button 
               onClick={() => setShowLangManager(true)}
               className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-lg flex items-center justify-center gap-2"
             >
               <Download size={14} />
               Manage Offline Languages
             </button>
          </div>
        )}

        {/* Input Area */}
        <div className="flex-1 relative min-h-[160px]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isOfflineMode ? "Type or paste text to speak..." : "Type text for high-quality AI speech..."}
            className="w-full h-full bg-slate-800 border-none rounded-2xl p-4 text-slate-100 placeholder-slate-500 resize-none focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
          />
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button 
              onClick={() => setText('')}
              className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-full transition-colors"
              title="Clear"
            >
              <RefreshCw size={14} />
            </button>
            <button 
              onClick={handlePaste}
              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
            >
              <Copy size={12} /> Paste
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 bg-slate-800 p-4 rounded-2xl">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Select Language</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(SALanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSelectedLang(lang)}
                  className={`text-xs py-2 px-2 rounded-lg text-left transition-all truncate ${
                    selectedLang === lang 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500 flex justify-between items-center">
              <span className="flex items-center gap-1">
                {isOfflineMode ? <WifiOff size={10} /> : <Wifi size={10} />}
                {isOfflineMode ? 'System Voice' : GEMINI_VOICES[selectedVoiceId]?.name || 'AI Voice'}
              </span>
              {isOfflineMode && (
                <span className={`${offlinePacks.find(p => p.language === selectedLang)?.downloaded ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {offlinePacks.find(p => p.language === selectedLang)?.downloaded ? 'Ready offline' : 'Download required'}
                </span>
              )}
            </div>
          </div>

          {/* Playback Action */}
          {isPlaying ? (
            <button
             onClick={stopPlayback}
             className="w-full py-4 font-bold rounded-xl shadow-lg bg-red-500/20 text-red-400 border border-red-500/50 flex items-center justify-center gap-2 hover:bg-red-500/30 transition-colors"
            >
              <Square size={18} fill="currentColor" /> Stop Speaking
            </button>
          ) : (
            <button
              onClick={() => handleGenerate()}
              disabled={loading || !text}
              className={`w-full py-4 font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                isOfflineMode 
                ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-indigo-900/50'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
              {loading ? 'Generating...' : isOfflineMode ? 'Speak Offline' : 'Generate AI Speech'}
            </button>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* Hidden Audio Element for Online playback */}
          <audio ref={audioRef} onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} className="hidden" src={audioUrl || undefined} />
        </div>
      </div>

      {/* Offline Language Manager Modal */}
      {showLangManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Globe size={18} className="text-indigo-400" />
                Offline Languages
              </h3>
              <button onClick={() => setShowLangManager(false)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              {offlinePacks.map(pack => (
                <div key={pack.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-xl">
                  <div>
                    <div className="font-medium text-slate-200">{pack.language}</div>
                    <div className="text-xs text-slate-500">{pack.size} • {pack.localeCode}</div>
                  </div>
                  {pack.downloaded ? (
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded text-xs font-medium">
                      <Check size={12} /> Installed
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleDownloadPack(pack.id)}
                      className="flex items-center gap-1 bg-slate-700 hover:bg-indigo-600 hover:text-white text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Download size={12} /> Download
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-800/50 text-xs text-slate-500 text-center">
              Downloading enables speech synthesis without internet connection.
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Helper to convert AudioBuffer to WAV Blob for <audio> src
function bufferToWav(abuffer: AudioBuffer, sampleRate: number) {
  const numOfChan = abuffer.numberOfChannels,
      length = abuffer.length * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [],
      sample = abuffer.getChannelData(0);
  
  let offset = 0,
      pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit (hardcoded in this example)

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  while(pos < abuffer.length) {
      for(let i = 0; i < numOfChan; i++) {             // interleave channels
          let sample = Math.max(-1, Math.min(1, abuffer.getChannelData(i)[pos])); // clamp
          sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
          view.setInt16(44 + offset, sample, true);    // write 16-bit sample
          offset += 2;
      }
      pos++;
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
  }

  function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
  }
}

export default TTSMode;
