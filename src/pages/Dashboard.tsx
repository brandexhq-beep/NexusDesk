import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import type { Station, Session, PricingRule, Customer, Game } from '../types';
import { calculateDynamicCost } from '../lib/pricing';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Play, Square, Plus, CalendarDays, Bell, Users, BarChart3, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { StartSessionModal } from '../components/StartSessionModal';
import { StopSessionModal } from '../components/StopSessionModal';
import { AddFoodModal } from '../components/AddFoodModal';
import { PricingChartModal } from '../components/PricingChartModal';
import { TransferSessionModal } from '../components/TransferSessionModal';
import { ArrowRightLeft } from 'lucide-react';

export function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [startModalStation, setStartModalStation] = useState<Station | null>(null);
  const [stopModalSession, setStopModalSession] = useState<{station: Station, session: Session} | null>(null);
  const [foodModalSession, setFoodModalSession] = useState<Session | null>(null);
  const [transferModalData, setTransferModalData] = useState<{station: Station, session: Session} | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  
  const [stationSearch, setStationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'free'>('all');

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [stationsData, rulesData, gamesData] = await Promise.all([
      db.stations.getAll(),
      db.pricingRules.getAll(),
      db.games.getAll()
    ]);
    setStations(stationsData);
    setRules(rulesData);
    setGames(gamesData);
    setLoading(false);
  };

  const moveStation = async (station: Station, direction: 'left' | 'right') => {
    // Sort all current stations by sort_order ascending
    const sorted = [...stations].sort((a, b) => {
      const orderA = a.sort_order ?? 0;
      const orderB = b.sort_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    const idx = sorted.findIndex(s => s.id === station.id);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap elements in sorted array
    const temp = sorted[idx];
    sorted[idx] = sorted[targetIdx];
    sorted[targetIdx] = temp;

    // Reassign clear sequential sort_order (10, 20, 30...) to avoid ties
    const updatedStations = sorted.map((st, index) => ({
      ...st,
      sort_order: (index + 1) * 10
    }));

    // Update local state immediately for instant feedback
    setStations(updatedStations);

    // Persist all updated sort_orders to database
    await Promise.all(
      updatedStations.map(st => db.stations.update(st.id, { sort_order: st.sort_order }))
    );
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

  const occupiedCount = stations.filter(s => s.status === 'occupied').length;
  const freeCount = stations.filter(s => s.status === 'free').length;

  const filteredStations = stations.filter(st => {
    if (statusFilter === 'occupied' && st.status !== 'occupied') return false;
    if (statusFilter === 'free' && st.status !== 'free') return false;
    if (stationSearch.trim()) {
      const q = stationSearch.toLowerCase();
      return st.name.toLowerCase().includes(q) || st.type.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live station status, active player monitoring, and quick checkout.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsPricingModalOpen(true)} variant="outline" className="border-border gap-2 text-xs">
            <BarChart3 className="w-4 h-4 text-indigo-400" /> Pricing Chart
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-muted-foreground backdrop-blur-md">
            <CalendarDays className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium">{today} • {timeString}</span>
          </div>
        </div>
      </div>

      {/* Station Quick Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-black/40 border border-white/10 rounded-xl">
        <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 p-1 rounded-lg">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({stations.length})
          </button>
          <button
            onClick={() => setStatusFilter('occupied')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'occupied' ? 'bg-red-500/20 border border-red-500/30 text-red-400 font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Occupied ({occupiedCount})
          </button>
          <button
            onClick={() => setStatusFilter('free')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
              statusFilter === 'free' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Free ({freeCount})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search station name or type..."
            value={stationSearch}
            onChange={(e) => setStationSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-black/30 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading stations...</div>
      ) : (
        (() => {
          const sortedStations = [...filteredStations].sort((a, b) => {
            const orderA = a.sort_order ?? 0;
            const orderB = b.sort_order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
          });

          const getCategoryMeta = (type: string) => {
            if (type.startsWith('ps5_sim')) return { label: '🏎️ SIM RACING ZONE', color: 'border-amber-500/30 text-amber-400' };
            if (type.startsWith('ps5_vr')) return { label: '🥽 VR GAMING ARENA', color: 'border-purple-500/30 text-purple-400' };
            if (type.startsWith('ps5')) return { label: '🎮 PLAYSTATION / PS5', color: 'border-indigo-500/30 text-indigo-400' };
            if (type === 'snooker' || type === 'pool') return { label: '🎱 POOL & SNOOKER TABLES', color: 'border-emerald-500/30 text-emerald-400' };
            if (type === 'pc') return { label: '💻 PC GAMING RIGS', color: 'border-cyan-500/30 text-cyan-400' };
            return { label: '🎲 OTHER GAMING STATIONS', color: 'border-white/20 text-muted-foreground' };
          };

          const catKeys = Array.from(new Set(sortedStations.map(s => {
            if (s.type.startsWith('ps5_sim')) return 'sim';
            if (s.type.startsWith('ps5_vr')) return 'vr';
            if (s.type.startsWith('ps5')) return 'ps5';
            if (s.type === 'snooker' || s.type === 'pool') return 'pool';
            if (s.type === 'pc') return 'pc';
            return 'other';
          })));

          if (sortedStations.length === 0) {
            return <div className="text-center py-12 text-muted-foreground">No stations found matching your search.</div>;
          }

          return (
            <div className="space-y-8">
              {catKeys.map(catKey => {
                const catStations = sortedStations.filter(s => {
                  if (catKey === 'sim') return s.type.startsWith('ps5_sim');
                  if (catKey === 'vr') return s.type.startsWith('ps5_vr');
                  if (catKey === 'ps5') return s.type.startsWith('ps5') && !s.type.includes('sim') && !s.type.includes('vr');
                  if (catKey === 'pool') return s.type === 'snooker' || s.type === 'pool';
                  if (catKey === 'pc') return s.type === 'pc';
                  return !s.type.startsWith('ps5') && s.type !== 'snooker' && s.type !== 'pool' && s.type !== 'pc';
                });

                if (catStations.length === 0) return null;
                const meta = getCategoryMeta(catStations[0].type);

                return (
                  <div key={catKey} className="space-y-4">
                    <div className={`flex items-center justify-between pb-2 border-b border-white/10 ${meta.color}`}>
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-bold tracking-wider uppercase">{meta.label}</h2>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-mono font-semibold">
                          {catStations.length} {catStations.length === 1 ? 'Station' : 'Stations'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {catStations.map(station => (
                        <StationCard 
                          key={station.id} 
                          station={station} 
                          rules={rules}
                          allGames={games}
                          now={currentTime.getTime()}
                          onMove={(dir) => moveStation(station, dir)}
                          onStartClick={() => setStartModalStation(station)} 
                          onTransferClick={(session) => setTransferModalData({station, session})}
                          onStopClick={(session) => setStopModalSession({station, session})}
                          onAddFoodClick={(session) => setFoodModalSession(session)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
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

      <TransferSessionModal
        session={transferModalData?.session || null}
        currentStation={transferModalData?.station || null}
        allStations={stations}
        onClose={() => setTransferModalData(null)}
        onSuccess={loadData}
      />

      <PricingChartModal
        open={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
      />
    </div>
  );
}

function StationCard({ 
  station, 
  rules, 
  allGames, 
  now, 
  onMove,
  onStartClick, 
  onTransferClick,
  onStopClick, 
  onAddFoodClick 
}: { 
  station: Station, 
  rules: PricingRule[], 
  allGames: Game[], 
  now: number, 
  onMove: (dir: 'left' | 'right') => void,
  onStartClick: () => void, 
  onTransferClick: (session: Session) => void,
  onStopClick: (session: Session) => void, 
  onAddFoodClick: (session: Session) => void 
}) {
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

  // Resolve selected running games
  const runningGames = (activeSession?.game_ids || []).map(id => {
    return allGames.find(g => g.id === id)?.name || 'Game';
  });

  const installedGameNames = (station.installed_games || []).map(id => {
    return allGames.find(g => g.id === id)?.name;
  }).filter(Boolean);

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
              <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded px-1 py-0.5 mr-1">
                <button 
                  onClick={() => onMove('left')} 
                  className="text-xs text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                  title="Move Left"
                >
                  ⬅️
                </button>
                <button 
                  onClick={() => onMove('right')} 
                  className="text-xs text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                  title="Move Right"
                >
                  ➡️
                </button>
              </div>
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
        
        <CardContent className="flex-1 py-4 flex flex-col justify-between">
          {isOccupied ? (
            <div className="space-y-3">
              {/* Customer Profile Banner on Active Station */}
              <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold text-xs uppercase shrink-0">
                    {customer ? customer.name.charAt(0) : 'W'}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-indigo-200 truncate max-w-[140px]">
                      {customer ? customer.name : 'Walk-in Customer'}
                    </div>
                    {customer?.phone ? (
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {customer.phone}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground italic">No profile attached</div>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  customer ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-white/5 border-white/10 text-muted-foreground'
                }`}>
                  {customer ? 'Member' : 'Walk-in'}
                </span>
              </div>

              {/* Selected / Running Game Display */}
              {runningGames.length > 0 ? (
                <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex flex-col gap-1.5 shadow-sm shadow-cyan-950/50">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-300">
                    <span className="flex items-center gap-1.5 tracking-wider uppercase font-mono text-[10px]">
                      <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
                      Running Game
                    </span>
                    {activeSession?.num_players ? (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 font-mono">
                        <Users className="w-3 h-3 text-cyan-400" /> {activeSession.num_players}P
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {runningGames.map((gameName, idx) => (
                      <span 
                        key={idx} 
                        className="px-2.5 py-1 text-xs font-bold rounded-md bg-gradient-to-r from-cyan-500 to-emerald-500 text-black shadow-md shadow-cyan-500/20 tracking-wide flex items-center gap-1"
                      >
                        {gameName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-md bg-white/5 border border-white/5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Gamepad2 className="w-3.5 h-3.5 opacity-60" />
                    No Game Tagged
                  </span>
                  {activeSession?.num_players ? (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Users className="w-3 h-3" /> {activeSession.num_players}P
                    </span>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
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
            <div className="h-full flex flex-col justify-center items-center text-muted-foreground py-3">
              <span className="text-2xl font-light mb-1 text-white">₹ {station.hourly_rate}</span>
              <span className="text-xs uppercase tracking-wider">Per Hour</span>

              {installedGameNames.length > 0 && (
                <div className="mt-3 text-center">
                  <span className="text-[11px] text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full font-medium">
                    {installedGameNames.length} games installed
                  </span>
                </div>
              )}
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
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 text-xs h-8 text-indigo-300" onClick={() => handleExtend(30)}>
                  +30 Min
                </Button>
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 text-xs h-8 text-indigo-300" onClick={() => handleExtend(60)}>
                  +1 Hr
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" title="Manual Reminder" className="px-2.5 border-white/10 hover:bg-white/5 text-blue-400" onClick={handleManualReminder}>
                  <Bell className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" title="Transfer Station / Players" className="px-2.5 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300" onClick={() => activeSession && onTransferClick(activeSession)}>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 text-xs px-2" onClick={() => activeSession && onAddFoodClick(activeSession)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Item
                </Button>
                <Button variant="destructive" className="flex-1 bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20 text-xs px-2" onClick={() => activeSession && onStopClick(activeSession)}>
                  <Square className="w-3.5 h-3.5 mr-1" /> Stop
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
