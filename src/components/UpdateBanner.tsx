import { useEffect, useState } from 'react';
import { updater } from '../services/db';
import { Download, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready';

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle');
  const [info, setInfo] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only available in Electron context
    if (!(window as any).api?.updater) return;

    updater.onUpdateAvailable((i) => {
      setInfo(i);
      setState('available');
    });

    updater.onUpdateProgress((p) => {
      setState('downloading');
      setProgress(Math.round(p.percent || 0));
    });

    updater.onUpdateDownloaded((i) => {
      setInfo(i);
      setState('ready');
      setDismissed(false); // re-show if dismissed
    });

    return () => updater.removeListeners();
  }, []);

  if (dismissed || state === 'idle') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-indigo-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl shadow-2xl shadow-indigo-500/20 p-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white text-sm">
              {state === 'ready'
                ? `v${info?.version} ready to install`
                : state === 'downloading'
                ? 'Downloading update...'
                : `Update v${info?.version} available`}
            </p>
            <p className="text-xs text-indigo-300 mt-0.5">
              {state === 'ready'
                ? 'Restart the app to apply the update.'
                : state === 'downloading'
                ? `${progress}% complete`
                : 'A new version is being downloaded automatically.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-indigo-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {state === 'downloading' && (
        <div className="w-full bg-indigo-950 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="bg-indigo-400 h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {state === 'ready' && (
        <Button
          onClick={() => updater.installUpdate()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-2 mt-1"
          size="sm"
        >
          <RefreshCw className="w-4 h-4" />
          Restart &amp; Install Now
        </Button>
      )}

      {state === 'available' && (
        <div className="flex items-center gap-2 text-xs text-indigo-300">
          <Download className="w-3.5 h-3.5 animate-bounce" />
          Downloading in the background…
        </div>
      )}
    </div>
  );
}
