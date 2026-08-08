import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import { MessageCircle, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface QueueItem {
  id: string;
  chatId: string;
  status: 'pending' | 'sent' | 'failed';
}

export function WhatsAppStatus() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [status, setStatus] = useState<{ ready: boolean; qr: string | null }>({ ready: false, qr: null });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [queueRes, statusRes] = await Promise.all([
          db.whatsappQueue.getAll(),
          whatsapp.getStatus()
        ]);
        
        setQueue(queueRes || []);
        setStatus(statusRes || { ready: false, qr: null });
      } catch (err) {
        // Server might be down, ignore silently or show error
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const sentCount = queue.filter(q => q.status === 'sent').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;

  if (!status.ready && !status.qr) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground bg-white/5 rounded-xl border border-white/10 mt-2">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        WhatsApp Starting...
      </div>
    );
  }

  if (status.qr) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground bg-white/5 rounded-xl border border-white/10 mt-2">
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertCircle className="w-4 h-4" />
          <span>WhatsApp Not Linked</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Waiting for QR scan...
        </p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground bg-white/5 rounded-xl border border-white/10 mt-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        WhatsApp Ready
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-3 text-xs bg-white/5 rounded-xl border border-white/10 mt-2 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <MessageCircle className="w-4 h-4 text-indigo-400" />
          Message Queue
        </div>
        {pendingCount > 0 && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <div className="flex flex-col items-center p-1.5 bg-black/30 rounded-lg">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</span>
          <span className={`font-mono text-sm font-bold ${pendingCount > 0 ? 'text-indigo-400' : 'text-muted-foreground'}`}>{pendingCount}</span>
        </div>
        <div className="flex flex-col items-center p-1.5 bg-black/30 rounded-lg">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sent</span>
          <span className={`font-mono text-sm font-bold ${sentCount > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{sentCount}</span>
        </div>
        <div className="flex flex-col items-center p-1.5 bg-black/30 rounded-lg">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</span>
          <span className={`font-mono text-sm font-bold ${failedCount > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{failedCount}</span>
        </div>
      </div>
    </div>
  );
}
