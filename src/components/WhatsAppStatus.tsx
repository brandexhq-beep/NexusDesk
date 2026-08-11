import { useEffect, useState, useRef } from 'react';
import { db, whatsapp } from '../services/db';
import {
  MessageCircle, CheckCircle2, AlertCircle, Loader2,
  WifiOff, RefreshCw, Clock, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WaStatus {
  ready: boolean;
  qr: string | null;
  state: string;
  initError: string | null;
  startedAt: number;
  elapsedMs: number;
  restartAttempts: number;
  maxRestarts: number;
}

interface QueueItem {
  id: string;
  chatId: string;
  status: 'pending' | 'sent' | 'failed';
  retryCount?: number;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>;
}

export function WhatsAppStatus() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [status, setStatus] = useState<WaStatus>({
    ready: false, qr: null, state: 'starting',
    initError: null, startedAt: Date.now(), elapsedMs: 0,
    restartAttempts: 0, maxRestarts: 5,
  });
  const [reconnecting, setReconnecting] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [queueRes, statusRes] = await Promise.all([
          db.whatsappQueue.getAll(),
          whatsapp.getStatus(),
        ]);
        setQueue(queueRes || []);
        if (statusRes) setStatus(statusRes);
      } catch (_) {}
    };
    fetch();
    pollRef.current = window.setInterval(fetch, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try { await whatsapp.reconnect(); } catch (_) {}
    setTimeout(() => setReconnecting(false), 3000);
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const sentCount    = queue.filter(q => q.status === 'sent').length;
  const failedCount  = queue.filter(q => q.status === 'failed').length;

  // ── READY ──────────────────────────────────────────────────────────────────
  if (status.ready) {
    const rl = (status as any).rateLimits;
    if (queue.length === 0) {
      return (
        <div className="flex items-center gap-2 p-3 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-xl mt-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <span className="text-emerald-300 font-medium">WhatsApp Connected</span>
            {rl?.isDND && (
              <span className="ml-2 text-[10px] text-orange-400 font-bold">DND ACTIVE</span>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5 p-3 text-xs bg-white/5 rounded-xl border border-white/10 mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-emerald-300">
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp — Message Queue</span>
          </div>
          {pendingCount > 0 && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {[
            { label: 'Pending', count: pendingCount, color: pendingCount > 0 ? 'text-indigo-400' : 'text-muted-foreground' },
            { label: 'Sent',    count: sentCount,    color: sentCount > 0    ? 'text-emerald-400' : 'text-muted-foreground' },
            { label: 'Failed',  count: failedCount,  color: failedCount > 0  ? 'text-red-400' : 'text-muted-foreground' },
          ].map(({ label, count, color }) => (
            <div key={label} className="flex flex-col items-center p-1.5 bg-black/30 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              <span className={`font-mono text-sm font-bold ${color}`}>{count}</span>
            </div>
          ))}
        </div>
        {rl && (
          <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground/70 border-t border-white/5 pt-1">
            <span>Promo: {rl.hourlyPromoUsed}/{rl.hourlyPromoMax}/hr</span>
            {rl.isDND && <span className="text-orange-400 font-bold">DND — promos paused</span>}
          </div>
        )}
      </div>
    );
  }

  // ── QR WAITING ─────────────────────────────────────────────────────────────
  if (status.state === 'qr') {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-xl mt-2">
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium">WhatsApp — Scan QR Code</span>
        </div>
        <p className="text-yellow-300/70">Go to Settings → WhatsApp to scan the QR code with your phone.</p>
      </div>
    );
  }

  // ── AUTH FAILURE ───────────────────────────────────────────────────────────
  if (status.state === 'auth_failure') {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-xl mt-2">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">WhatsApp — Auth Failed</span>
        </div>
        <p className="text-red-300/70">Re-scanning QR… Go to Settings to re-link your account.</p>
      </div>
    );
  }

  // ── DISCONNECTED ───────────────────────────────────────────────────────────
  if (status.state === 'disconnected') {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs bg-orange-500/10 border border-orange-500/20 rounded-xl mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-400">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="font-medium">WhatsApp Disconnected</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReconnect}
            disabled={reconnecting}
            className="h-6 px-2 text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 text-[10px]"
          >
            {reconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Reconnect
          </Button>
        </div>
        <p className="text-orange-300/70">
          {status.restartAttempts < status.maxRestarts
            ? `Auto-reconnecting… (attempt ${status.restartAttempts}/${status.maxRestarts})`
            : 'Max retries reached. Click Reconnect to retry manually.'}
        </p>
      </div>
    );
  }

  // ── ERROR (max retries or browser launch failed) ───────────────────────────
  if (status.state === 'error') {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-xl mt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">WhatsApp Error</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReconnect}
            disabled={reconnecting}
            className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 text-[10px]"
          >
            {reconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Retry
          </Button>
        </div>
        {status.initError && (
          <p className="text-red-300/70 text-[10px] break-all">{status.initError}</p>
        )}
      </div>
    );
  }

  // ── STARTING / AUTHENTICATED (loading) ────────────────────────────────────
  const isSlowStart = status.elapsedMs > 30000; // > 30 seconds
  const isVerySlowStart = status.elapsedMs > 90000; // > 90 seconds

  return (
    <div className={`flex flex-col gap-1.5 p-3 text-xs rounded-xl border mt-2 ${
      isVerySlowStart
        ? 'bg-red-500/10 border-red-500/20'
        : isSlowStart
        ? 'bg-yellow-500/10 border-yellow-500/20'
        : 'bg-white/5 border-white/10'
    }`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 font-medium ${
          isVerySlowStart ? 'text-red-400' : isSlowStart ? 'text-yellow-400' : 'text-muted-foreground'
        }`}>
          {isVerySlowStart
            ? <AlertTriangle className="w-4 h-4 shrink-0" />
            : <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          }
          <span>
            {status.state === 'authenticated' ? 'WhatsApp Loading…' : 'WhatsApp Starting…'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <ElapsedTimer startedAt={status.startedAt} />
        </div>
      </div>

      {isVerySlowStart && (
        <div className="flex items-center justify-between mt-1">
          <p className="text-red-300/70">Taking unusually long. Browser may have stalled.</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReconnect}
            disabled={reconnecting}
            className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 text-[10px] shrink-0"
          >
            {reconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Force Restart
          </Button>
        </div>
      )}

      {isSlowStart && !isVerySlowStart && (
        <p className="text-yellow-300/70">
          Taking longer than usual. Chrome is loading in the background…
        </p>
      )}

      {!isSlowStart && (
        <p className="text-muted-foreground/70">
          {status.state === 'authenticated'
            ? 'Session found — loading your account…'
            : 'Launching browser and loading session…'}
        </p>
      )}
    </div>
  );
}
