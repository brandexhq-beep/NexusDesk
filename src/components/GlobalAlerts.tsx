import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { MenuItem } from '../types';

import { AlertTriangle, X, Package } from 'lucide-react';

export function GlobalAlerts() {
  const [alerts, setAlerts] = useState<{ id: string; stationName: string }[]>([]);
  const [stockAlerts, setStockAlerts] = useState<MenuItem[]>([]);

  useEffect(() => {
    // Poll active sessions every 10 seconds to see if any prepaid sessions have expired
    const checkSessions = async () => {
      const activeSessions = await db.sessions.getAll(); // Ideally we'd have a getActive() but getAll is fine for mockup
      const active = activeSessions.filter(s => s.status === 'active' && s.prepaid_duration_mins !== null);
      
      const stations = await db.stations.getAll();
      const newAlerts: { id: string; stationName: string }[] = [];

      for (const session of active) {
        if (!session.prepaid_duration_mins) continue;
        
        const now = Date.now();
        const diffMs = now - Number(session.start_time);
        const diffMins = diffMs / 60000;

        // 5-minute warning logic
        if (diffMins >= session.prepaid_duration_mins - 5 && !session.warning_sent) {
          if (session.customer_id) {
            const customer = await db.customers.getById(session.customer_id);
            const station = stations.find(st => st.id === session.station_id);
            
            if (customer && customer.phone && station) {
              const message = `Hi ${customer.name}, your gaming session at ${station.name} has 5 minutes left. Please visit the counter if you'd like to extend!`;
              try {
                await fetch('http://localhost:3001/send-invoice', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone: customer.phone, message })
                });
              } catch (e) {
                console.error("Failed to send 5-min warning via WhatsApp", e);
              }
            }
          }
          // Mark as sent whether it succeeded or if there was no customer/phone to prevent retrying
          await db.sessions.update(session.id, { warning_sent: true });
        }

        if (diffMins >= session.prepaid_duration_mins) {
          // Time is up!
          const station = stations.find(st => st.id === session.station_id);
          if (station) {
            newAlerts.push({ id: session.id, stationName: station.name });
          }
        }
      }

      // If we found new alerts that weren't in the state before, play a sound
      if (newAlerts.length > 0 && alerts.length !== newAlerts.length) {
        playSound();
      }

      setAlerts(newAlerts);
    };

    const checkStock = async () => {
      const menu = await db.menu.getAll();
      const lowStock = menu.filter(m => m.active && (m.category === 'drink' || m.category === 'snack') && m.stock_quantity !== undefined && m.stock_quantity <= 5);
      setStockAlerts(lowStock);
    };

    checkSessions();
    checkStock();
    const interval = setInterval(() => {
      checkSessions();
      checkStock();
    }, 5000);
    return () => clearInterval(interval);
  }, [alerts.length]);

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
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
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
    setStockAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0 && stockAlerts.length === 0) return null;

  return (
    <>
      {alerts.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pt-4 pointer-events-none gap-2">
          {alerts.map(alert => (
            <div key={alert.id} className="pointer-events-auto w-full max-w-2xl bg-red-600 text-white shadow-2xl shadow-red-600/50 rounded-xl p-4 flex items-center justify-between border-2 border-red-400 animate-in slide-in-from-top-10 fade-in duration-500">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-2 rounded-full animate-pulse">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-widest">{alert.stationName}: TIME UP!</h2>
                  <p className="text-red-100 font-medium">The prepaid session has expired. Please stop the session.</p>
                </div>
              </div>
              <button 
                onClick={() => dismissAlert(alert.id)}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          ))}
        </div>
      )}

      {stockAlerts.length > 0 && (
        <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start pointer-events-none gap-2">
          {stockAlerts.map(alert => (
            <div key={alert.id} className="pointer-events-auto w-80 bg-amber-500 text-white shadow-xl shadow-amber-500/30 rounded-xl p-3 flex items-center justify-between animate-in slide-in-from-bottom-5 fade-in duration-500">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-1.5 rounded-full">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider">Low Stock</h2>
                  <p className="text-amber-50 text-xs font-medium">{alert.name} ({alert.stock_quantity} left)</p>
                </div>
              </div>
              <button 
                onClick={() => dismissStockAlert(alert.id)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
