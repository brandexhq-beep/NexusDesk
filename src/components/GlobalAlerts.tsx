import { useEffect, useState } from 'react';
import { db } from '../services/db';

import { AlertTriangle, X } from 'lucide-react';

export function GlobalAlerts() {
  const [alerts, setAlerts] = useState<{ id: string; stationName: string }[]>([]);

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

    checkSessions();
    const interval = setInterval(checkSessions, 5000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  const playSound = () => {
    try {
      // Standard beep using AudioContext
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
      console.error("Audio play failed:", e);
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
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
  );
}
