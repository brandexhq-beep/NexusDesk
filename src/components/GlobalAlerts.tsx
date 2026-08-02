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
        
        const remindersSent = session.reminders_sent || [];
        let updated = false;

        const checkAndSend = async (thresholdMins: number, label: string, message: string) => {
           if (diffMins >= (session.prepaid_duration_mins! - thresholdMins) && !remindersSent.includes(label)) {
              if (session.customer_id) {
                const customer = await db.customers.getById(session.customer_id);
                if (customer && customer.phone) {
                   try {
                     await fetch('http://localhost:3001/send-invoice', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ phone: customer.phone, message })
                     });
                   } catch (e) {
                     console.error(`Failed to send ${label} reminder`, e);
                   }
                }
              }
              remindersSent.push(label);
              updated = true;
           }
        };

        const station = stations.find(st => st.id === session.station_id);
        const stName = station ? station.name : 'your station';

        // Check 15m warning
        await checkAndSend(15, '15m', `Hi! Your session at ${stName} has 15 minutes left. You can extend at the counter!`);
        
        // Check 5m warning
        await checkAndSend(5, '5m', `Hi! Your session at ${stName} has only 5 minutes left.`);

        // Time is up
        if (diffMins >= session.prepaid_duration_mins) {
          if (station) {
            newAlerts.push({ id: session.id, stationName: station.name });
          }
          await checkAndSend(0, '0m', `Your session at ${stName} is now over. Thank you for playing!`);
        }

        if (updated) {
           await db.sessions.update(session.id, { reminders_sent: remindersSent });
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
      const settings = await db.settings.get();
      const threshold = settings.low_stock_threshold || 5;
      const lowStock = menu.filter(m => m.active && (m.category === 'drink' || m.category === 'snack') && m.stock_quantity !== undefined && m.stock_quantity <= threshold);
      setStockAlerts(lowStock);

      // WhatsApp alerting
      if (settings.owner_phone) {
        for (const item of lowStock) {
          if (!item.low_stock_notified) {
            try {
              await fetch('http://localhost:3001/send-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: settings.owner_phone, message: `⚠️ Low Stock Alert:\n${item.name} is down to ${item.stock_quantity} items. Please restock soon.` })
              });
              await db.menu.update(item.id, { low_stock_notified: true });
            } catch (e) {
              console.error('Failed to send stock alert', e);
            }
          }
        }
      }
    };

    const checkLoyaltyExpiry = async () => {
      const settings = await db.settings.get();
      if (!settings.loyalty_expiry_enabled || !settings.loyalty_expiry_days) return;

      const customers = await db.customers.getAll();
      const now = Date.now();
      const expiryMs = settings.loyalty_expiry_days * 24 * 60 * 60 * 1000;
      const warningMs = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const customer of customers) {
        if (customer.loyalty_points <= 0) continue;
        
        const lastUpdated = customer.loyalty_points_updated_at || Number(customer.created_at);
        const expiresAt = lastUpdated + expiryMs;
        
        if (now >= expiresAt) {
          // Points expired!
          await db.customers.update(customer.id, {
            loyalty_points: 0,
            loyalty_points_updated_at: now,
            loyalty_reminder_sent: false
          });
          console.log(`Reset loyalty points for ${customer.name} due to expiration.`);
        } else if (now >= expiresAt - warningMs && !customer.loyalty_reminder_sent) {
          // Less than 7 days left, and haven't sent a reminder yet
          const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
          if (customer.phone) {
            const message = `Hi ${customer.name}, you have ${customer.loyalty_points} loyalty points expiring in ${daysLeft} days! Book a session soon to use them before they're gone.`;
            try {
              await fetch('http://localhost:3001/send-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: customer.phone, message })
              });
              
              await db.customers.update(customer.id, { loyalty_reminder_sent: true });
              console.log(`Sent loyalty expiry reminder to ${customer.name}`);
            } catch (e) {
              console.error('Failed to send loyalty reminder', e);
            }
          }
        }
      }
    };

    checkSessions();
    checkStock();
    checkLoyaltyExpiry();

    const interval = setInterval(() => {
      checkSessions();
      checkStock();
    }, 5000);
    
    // Check loyalty expiry less frequently (every 1 minute)
    const loyaltyInterval = setInterval(checkLoyaltyExpiry, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(loyaltyInterval);
    };
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
