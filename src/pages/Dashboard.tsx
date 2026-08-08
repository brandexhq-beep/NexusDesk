import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import type { Station, Session, PricingRule, Customer } from '../types';
import { calculateDynamicCost } from '../lib/pricing';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Play, Square, Plus, CalendarDays, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import { StartSessionModal } from '../components/StartSessionModal';
import { StopSessionModal } from '../components/StopSessionModal';
import { AddFoodModal } from '../components/AddFoodModal';

export function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [startModalStation, setStartModalStation] = useState<Station | null>(null);
  const [stopModalSession, setStopModalSession] = useState<{station: Station, session: Session} | null>(null);
  const [foodModalSession, setFoodModalSession] = useState<Session | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [stationsData, rulesData] = await Promise.all([
      db.stations.getAll(),
      db.pricingRules.getAll()
    ]);
    setStations(stationsData);
    setRules(rulesData);
    setLoading(false);
  };

  // Format current date and time
  const today = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeString = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-muted-foreground backdrop-blur-md">
          <CalendarDays className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium">{today} • {timeString}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading stations...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {stations.map(station => (
            <StationCard 
              key={station.id} 
              station={station} 
              rules={rules}
              now={currentTime.getTime()}
              onStartClick={() => setStartModalStation(station)} 
              onStopClick={(session) => setStopModalSession({station, session})}
              onAddFoodClick={(session) => setFoodModalSession(session)}
            />
          ))}
        </div>
      )}

      <StartSessionModal 
        station={startModalStation} 
        onClose={() => setStartModalStation(null)} 
        onStart={loadData} 
      />

      <StopSessionModal
        station={stopModalSession?.station || null}
        session={stopModalSession?.session || null}
        rules={rules}
        onClose={() => setStopModalSession(null)}
        onStop={loadData}
      />

      <AddFoodModal
        session={foodModalSession}
        onClose={() => setFoodModalSession(null)}
        onAdd={loadData}
      />
    </div>
  );
}

function StationCard({ station, rules, now, onStartClick, onStopClick, onAddFoodClick }: { station: Station, rules: PricingRule[], now: number, onStartClick: () => void, onStopClick: (session: Session) => void, onAddFoodClick: (session: Session) => void }) {
  const isOccupied = station.status === 'occupied';
  const isMaintenance = station.status === 'maintenance';
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState<string>('00:00:00');
  const [currentCost, setCurrentCost] = useState<number>(0);
  const [isHappyHour, setIsHappyHour] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (isOccupied) {
      db.sessions.getActiveByStation(station.id).then(session => {
        if (session) {
          setActiveSession(session);
          if (session.customer_id) {
            db.customers.getById(session.customer_id).then(c => setCustomer(c || null));
          } else {
            setCustomer(null);
          }
        }
      });
    } else {
      setActiveSession(null);
      setCustomer(null);
    }
  }, [isOccupied, station.id]);

  useEffect(() => {
    if (!activeSession) return;
    
    const diffMs = now - Number(activeSession.start_time);
    
    // Elapsed format
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
    setElapsed(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);

    // Basic Cost calc
    let tempCost = 0;
    if (activeSession.combo_id) {
      tempCost = activeSession.base_amount || 0; 
    } else {
      const customerFreeMins = customer ? customer.available_minutes : 0;
      const totalFreeMins = (activeSession.prepaid_duration_mins || 0) + customerFreeMins;
      const res = calculateDynamicCost(Number(activeSession.start_time), now, station, rules, totalFreeMins, activeSession.num_players);
      tempCost = (activeSession.base_amount || 0) + res.cost;
    }
    
    const extMins = activeSession.extended_minutes || 0;
    if (extMins > 0) {
      tempCost += (extMins / 60) * station.hourly_rate;
    }
    
    const foodTotal = activeSession.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0);
    setCurrentCost(tempCost + foodTotal);

    // Determine if currently in happy hour
    const date = new Date(now);
    const dayOfWeek = date.getDay();
    const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const activeRule = rules.find(rule => {
      if (!rule.active || !rule.days.includes(dayOfWeek)) return false;
      if (rule.start_time <= rule.end_time) {
        return timeString >= rule.start_time && timeString < rule.end_time;
      } else {
        return timeString >= rule.start_time || timeString < rule.end_time;
      }
    });
    setIsHappyHour(!!activeRule);
  }, [activeSession, station, rules, customer, now]);

  const handleExtend = async (mins: number) => {
    if (!activeSession) return;
    const currentExtended = activeSession.extended_minutes || 0;
    await db.sessions.update(activeSession.id, { extended_minutes: currentExtended + mins });
    setActiveSession({ ...activeSession, extended_minutes: currentExtended + mins });
  };

  const handleManualReminder = async () => {
    if (!activeSession || !customer?.phone) return;
    try {
      const message = `Hi! Just a manual reminder regarding your gaming session at ${station.name}.`;
      await whatsapp.sendInvoice({ phone: customer.phone, message });
      // Optionally update db or toast
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!isMaintenance ? { scale: 1.02 } : {}}
      transition={{ duration: 0.3 }}
    >
      <Card className={`h-full bg-black/40 backdrop-blur-md text-card-foreground flex flex-col shadow-lg transition-all duration-300 ${
        isMaintenance ? 'opacity-50 grayscale border-dashed border-red-500/30 pointer-events-none cursor-not-allowed' : 'border-white/10 hover:border-indigo-500/50'
      }`}>
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-primary" />
              {station.name}
              {!isOccupied && isHappyHour && <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-500 uppercase font-bold tracking-wider animate-pulse">Happy Hour</span>}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isOccupied && activeSession?.reminders_sent && activeSession.reminders_sent.length > 0 && (
                <div className="flex gap-1">
                  {activeSession.reminders_sent.map(r => (
                    <span key={r} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-bold uppercase">{r}</span>
                  ))}
                </div>
              )}
              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                isOccupied ? 'bg-red-500/10 text-red-400' : 
                isMaintenance ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {station.status}
              </span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 py-4">
          {isOccupied ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">Session Time</span>
                <span className="font-mono text-xl font-bold tracking-tight text-white">{elapsed}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium">Current Cost</span>
                <span className="font-mono text-2xl font-bold text-emerald-400">
                  ₹ {currentCost.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-muted-foreground py-6">
              <span className="text-2xl font-light mb-1 text-white">₹ {station.hourly_rate}</span>
              <span className="text-xs uppercase tracking-wider">Per Hour</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-4 border-t border-white/5 flex flex-col gap-2">
          {!isOccupied ? (
            <Button disabled={isMaintenance} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50" onClick={onStartClick}>
              <Play className="w-4 h-4 mr-2" /> Start Session
            </Button>
          ) : (
            <div className="w-full space-y-2">
              {(activeSession?.combo_id || activeSession?.prepaid_duration_mins) ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 text-xs h-8" onClick={() => handleExtend(30)}>
                    +30 Min
                  </Button>
                  <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 text-xs h-8" onClick={() => handleExtend(60)}>
                    +1 Hr
                  </Button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button variant="outline" title="Manual Reminder" className="px-3 border-white/10 hover:bg-white/5 text-blue-400" onClick={handleManualReminder}>
                  <Bell className="w-4 h-4" />
                </Button>
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => activeSession && onAddFoodClick(activeSession)}>
                  <Plus className="w-4 h-4 mr-2" /> Item
                </Button>
                <Button variant="destructive" className="flex-1 bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20" onClick={() => activeSession && onStopClick(activeSession)}>
                  <Square className="w-4 h-4 mr-2" /> Stop
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
