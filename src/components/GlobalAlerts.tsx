import { useEffect, useState, useRef } from 'react';
import { db, whatsapp } from '../services/db';
import type { MenuItem } from '../types';
import { AlertTriangle, Package, X } from 'lucide-react';

interface SessionAlert {
  id: string;
  stationName: string;
}

type StockAlertState = 'NORMAL' | 'LOW' | 'OUT_OF_STOCK';

export function GlobalAlerts() {
  const [alerts, setAlerts] = useState<SessionAlert[]>([]);
  const [stockAlerts, setStockAlerts] = useState<MenuItem[]>([]);
  
  // Deduplication state machine references
  const dismissedStockAlertsRef = useRef<Set<string>>(new Set());
  const itemAlertStatesRef = useRef<Map<string, StockAlertState>>(new Map());

  useEffect(() => {
    const checkSessions = async () => {
      const sessions = await db.sessions.getAll();
      const stations = await db.stations.getAll();
      const settings = await db.settings.get();

      const r1 = settings.session_reminder_mins_1 || 10;
      const r2 = settings.session_reminder_mins_2 || 5;
      const rEnd = settings.session_reminder_end_enabled ?? true;
      const waEnabled = settings.whatsapp_session_reminders_enabled ?? true;

      const activeSessions = sessions.filter(s => s.status === 'active' && s.prepaid_duration_mins);
      const newAlerts: SessionAlert[] = [];
      const now = Date.now();

      for (const session of activeSessions) {
        const station = stations.find(st => st.id === session.station_id);
        const startTime = new Date(session.start_time).getTime();
        const diffMins = Math.floor((now - startTime) / (1000 * 60));
        
        let updated = false;
        const remindersSent = session.reminders_sent ? [...session.reminders_sent] : [];

        const customer = session.customer_id ? await db.customers.getById(session.customer_id) : null;
        const phone = customer?.phone;

        const checkAndSend = async (_minsLeft: number, typeKey: string, defaultText: string) => {
          if (!remindersSent.includes(typeKey)) {
            remindersSent.push(typeKey);
            updated = true;
            if (waEnabled && phone) {
              try {
                await whatsapp.sendInvoice({ phone, message: defaultText });
              } catch (e) {
                console.error(`Failed to send ${typeKey} WA reminder`, e);
              }
            }
          }
        };

        const stName = station?.name || 'Station';

        const formatMsg = (tpl: string | undefined, def: string, mins: number) => {
          if (!tpl) return def;
          return tpl
            .replace('{customer_name}', customer?.name || 'Customer')
            .replace('{station_name}', stName)
            .replace('{time_left}', `${mins}`);
        };

        const remMins = (session.prepaid_duration_mins || 0) - diffMins;

        if (r1 > 0 && remMins <= r1 && remMins > r2) {
          const defaultText = `Reminder: Your session at ${stName} has ${r1} minutes remaining.`;
          const msg = formatMsg(settings.wa_template_warning_1, defaultText, r1);
          await checkAndSend(r1, `${r1}m`, msg);
        }
        
        if (r2 > 0 && remMins <= r2 && remMins > 0) {
          const defaultText = `Final Warning! Your session at ${stName} has only ${r2} minutes left.`;
          const msg = formatMsg(settings.wa_template_warning_2, defaultText, r2);
          await checkAndSend(r2, `${r2}m`, msg);
        }

        if (diffMins >= (session.prepaid_duration_mins || 0)) {
          if (station) {
            newAlerts.push({ id: session.id, stationName: station.name });
          }
          if (rEnd) {
            const defaultText = `Time is up for your session at ${stName}. Thank you for playing!`;
            const msg = formatMsg(settings.wa_template_end, defaultText, 0);
            await checkAndSend(0, '0m', msg);
          }
        }

        if (updated) {
           await db.sessions.update(session.id, { reminders_sent: remindersSent });
        }
      }

      if (newAlerts.length > 0 && alerts.length !== newAlerts.length) {
        playSound();
      }

      setAlerts(newAlerts);
    };

    const checkStock = async () => {
      const menu = await db.menu.getAll();
      const settings = await db.settings.get();
      const threshold = settings.low_stock_threshold || 5;

      const lowStockItems: MenuItem[] = [];
      const currentLowStock = menu.filter(m => m.active && (m.category === 'drink' || m.category === 'snack') && m.stock_quantity !== undefined && m.stock_quantity <= threshold);

      for (const item of menu) {
        if (!item.active || (item.category !== 'drink' && item.category !== 'snack') || item.stock_quantity === undefined) continue;

        const isLow = item.stock_quantity <= threshold;
        const isOutOfStock = item.stock_quantity === 0;

        const currentState: StockAlertState = isOutOfStock ? 'OUT_OF_STOCK' : (isLow ? 'LOW' : 'NORMAL');
        // previous state checked via itemAlertStatesRef

        if (currentState === 'NORMAL') {
          // Reset recovery state if item replenished
          dismissedStockAlertsRef.current.delete(item.id);
          itemAlertStatesRef.current.set(item.id, 'NORMAL');
        } else {
          itemAlertStatesRef.current.set(item.id, currentState);
          if (!dismissedStockAlertsRef.current.has(item.id)) {
            lowStockItems.push(item);
          }
        }
      }

      // Deduplicate state updates: only call setStockAlerts if IDs or stock changed
      setStockAlerts(prev => {
        const prevIds = prev.map(p => `${p.id}:${p.stock_quantity}`).sort().join(',');
        const newIds = lowStockItems.map(p => `${p.id}:${p.stock_quantity}`).sort().join(',');
        if (prevIds === newIds) return prev;
        return lowStockItems;
      });

      // WhatsApp alerting to owner on state transition
      if (settings.owner_phone) {
        for (const item of currentLowStock) {
          if (!item.low_stock_notified) {
            try {
              await whatsapp.sendInvoice({ phone: settings.owner_phone, message: `Low Stock Alert: ${item.name} has only ${item.stock_quantity} left.` });
              await db.menu.update(item.id, { low_stock_notified: true });
            } catch (e) {
              console.error('Failed to send stock alert', e);
            }
          }
        }
      }
    };

    checkSessions();
    checkStock();

    const interval = setInterval(() => {
      checkSessions();
      checkStock();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const playSound = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio play blocked by browser policy:", e);
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const dismissStockAlert = (id: string) => {
    dismissedStockAlertsRef.current.add(id);
    setStockAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0 && stockAlerts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none select-none flex flex-col justify-between p-4 overflow-hidden">
      {/* Session Time Up Alerts (Top Banner) */}
      {alerts.length > 0 && (
        <div className="flex flex-col items-center gap-2 w-full">
          {alerts.map(alert => (
            <div 
              key={alert.id} 
              className="pointer-events-auto w-full max-w-2xl bg-red-600 text-white shadow-2xl shadow-red-600/50 rounded-xl p-4 flex items-center justify-between border-2 border-red-400 animate-in slide-in-from-top-10 fade-in duration-300"
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-full animate-pulse">
                  <AlertTriangle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest">{alert.stationName}: TIME UP!</h2>
                  <p className="text-red-100 text-xs font-medium">The prepaid session has expired. Please stop the session.</p>
                </div>
              </div>
              <button 
                type="button"
                tabIndex={-1}
                onClick={() => dismissAlert(alert.id)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Low Inventory Toast Alerts (Bottom Right Portal - Floating above all UI & sidebar) */}
      {stockAlerts.length > 0 && (
        <div className="self-end flex flex-col items-end gap-2.5 max-w-sm">
          {stockAlerts.map(alert => (
            <div 
              key={alert.id} 
              className="pointer-events-auto w-80 bg-amber-500 text-white shadow-2xl shadow-amber-500/40 rounded-xl p-3.5 flex items-center justify-between border border-amber-300/40 animate-in slide-in-from-bottom-5 fade-in duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full shrink-0">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-white">Low Stock Alert</h2>
                  <p className="text-amber-50 text-xs font-semibold">{alert.name} ({alert.stock_quantity} left)</p>
                </div>
              </div>
              <button 
                type="button"
                tabIndex={-1}
                onClick={() => dismissStockAlert(alert.id)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
