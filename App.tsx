
import React, { useState } from 'react';
import { AppMode } from './types';
import TTSMode from './components/TTSMode';
import LiveMode from './components/LiveMode';
import { MessageSquare, Radio } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.TTS);
  const [isFloating, setIsFloating] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Header - Hidden when floating */}
      {!isFloating && (
        <header className="flex-none px-6 py-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                 <span className="font-bold text-white">M</span>
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                Mzansi Speak
              </h1>
            </div>
            <div className="text-xs font-medium px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v1.0 Beta
            </div>
          </div>
        </header>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="h-full flex flex-col">
           {mode === AppMode.TTS && <TTSMode onFloatingChange={setIsFloating} />}
           {mode === AppMode.LIVE && <LiveMode />}
        </div>
      </main>

      {/* Navigation (Tab Bar) - Hidden when floating */}
      {!isFloating && (
        <nav className="flex-none pb-safe bg-slate-900 border-t border-slate-800">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-4 p-4">
            <button
              onClick={() => setMode(AppMode.TTS)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                mode === AppMode.TTS 
                  ? 'text-indigo-400 bg-indigo-900/20' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <MessageSquare size={24} />
              <span className="text-xs font-medium">Text to Speech</span>
            </button>
            
            <button
              onClick={() => setMode(AppMode.LIVE)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                mode === AppMode.LIVE 
                  ? 'text-emerald-400 bg-emerald-900/20' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Radio size={24} />
              <span className="text-xs font-medium">Live Chat</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default App;
