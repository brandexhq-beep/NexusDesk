import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import type { Station, Session, PricingRule, Customer, Game } from '../types';
import { calculateDynamicCost } from '../lib/pricing';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Play, Square, Plus, CalendarDays, Bell, Users, BarChart3, Search, Pause, Clock, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { StartSessionModal } from '../components/StartSessionModal';
import { StopSessionModal } from '../components/StopSessionModal';
import { AddFoodModal } from '../components/AddFoodModal';
import { PricingChartModal } from '../components/PricingChartModal';
import { TransferSessionModal } from '../components/TransferSessionModal';
import { EditPaymentModal } from '../components/EditPaymentModal';
import { ArrowRightLeft } from 'lucide-react';

export function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [startModalStation, setStartModalStation] = useState<Station | null>(null);
  const [stopModalSession, setStopModalSession] = useState<{station: Station, session: Session, stopTime: number} | null>(null);
  const [foodModalSession, setFoodModalSession] = useState<Session | null>(null);
  const [transferModalData, setTransferModalData] = useState<{station: Station, session: Session} | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [lastCompletedSession, setLastCompletedSession] = useState<Session | null>(null);
  const [editPaymentSession, setEditPaymentSession] = useState<Session | null>(null);
  
  const [stationSearch, setStationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'free'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'ps5' | 'sim' | 'pool' | 'pc' | 'vr'>('all');

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [stationsData, rulesData, gamesData, sessionsData] = await Promise.all([
      db.stations.getAll(),
      db.pricingRules.getAll(),
      db.games.getAll(),
      db.sessions.getAll()
    ]);

    const activeStationIds = new Set(
      sessionsData.filter(s => s.status === 'active').map(s => s.station_id)
    );

    // Auto-heal any station marked occupied or paused that has no active session in DB
    for (const st of stationsData) {
      if ((st.status === 'occupied' || st.status === 'paused') && !activeStationIds.has(st.id)) {
        st.status = 'free';
        db.stations.update(st.id, { status: 'free' });
      }
    }

    setStations([...stationsData]);
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

  const occupiedCount = stations.filter(s => s.status === 'occupied' || s.status === 'paused').length;
  const freeCount = stations.filter(s => s.status === 'free').length;

  const handleOpenStopModal = async (station: Station, session: Session) => {
    const stopTime = Date.now();
    // Freeze session for checkout overlay if not already paused
    if (!session.is_paused) {
      await db.sessions.update(session.id, {
        is_paused: true,
        paused_at: stopTime,
        checkout_paused: true
      });
      await db.stations.update(station.id, { status: 'paused' });
      session.is_paused = true;
      session.paused_at = stopTime;
      session.checkout_paused = true;
    }
    setStopModalSession({ station, session, stopTime });
    loadData();
  };

  const handleCloseStopModal = async () => {
    if (stopModalSession?.session) {
      const sess = stopModalSession.session;
      // Double check from DB that this session is still active (was not completed by checkout)
      const currentDbSession = await db.sessions.getById(sess.id);
      if (currentDbSession && currentDbSession.status === 'active' && sess.checkout_paused) {
        // Resume session if checkout was cancelled
        const now = Date.now();
        const pausedDuration = sess.paused_at ? Math.max(0, now - sess.paused_at) : 0;
        const newTotalPaused = (sess.total_paused_ms || 0) + pausedDuration;
        await db.sessions.update(sess.id, {
          is_paused: false,
          paused_at: null,
          checkout_paused: false,
          total_paused_ms: newTotalPaused
        });
        await db.stations.update(stopModalSession.station.id, { status: 'occupied' });
        toast.info(`Checkout cancelled. ${stopModalSession.station.name} resumed.`);
      }
    }
    setStopModalSession(null);
    loadData();
  };

  const handleStopComplete = async (completedSession?: Session) => {
    const stationId = stopModalSession?.station?.id;
    if (stationId) {
      await db.stations.update(stationId, { status: 'free' });
    }
    setStopModalSession(null);
    await loadData();
    if (completedSession) {
      setLastCompletedSession(completedSession);
      const modeStr = (completedSession.payment_mode || 'cash').toUpperCase();
      toast.success('Session completed successfully!', {
        description: `Payment: ${modeStr} (₹${completedSession.total_amount})`,
        action: {
          label: 'Change Payment',
          onClick: () => setEditPaymentSession(completedSession)
        },
        duration: 9000
      });
    }
  };

  const filteredStations = stations.filter(st => {
    if (statusFilter === 'occupied' && st.status !== 'occupied' && st.status !== 'paused') return false;
    if (statusFilter === 'free' && st.status !== 'free') return false;

    if (categoryFilter === 'sim' && !st.type.startsWith('ps5_sim')) return false;
    if (categoryFilter === 'vr' && !st.type.startsWith('ps5_vr')) return false;
    if (categoryFilter === 'ps5' && (!st.type.startsWith('ps5') || st.type.includes('sim') || st.type.includes('vr'))) return false;
    if (categoryFilter === 'pool' && st.type !== 'snooker' && st.type !== 'pool') return false;
    if (categoryFilter === 'pc' && st.type !== 'pc') return false;

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

      {/* Quick Action Banner for Last Completed Transaction */}
      {lastCompletedSession && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 px-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 shadow-lg shadow-emerald-950/30 animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>
              Recent Checkout: <strong className="font-mono text-white">₹{lastCompletedSession.total_amount}</strong> via <span className="font-semibold uppercase tracking-wider text-emerald-300">{lastCompletedSession.payment_mode}</span>
              {lastCompletedSession.split_breakdown && lastCompletedSession.payment_mode === 'mixed' && (
                <span className="text-emerald-400/80 ml-1">
                  (Cash: ₹{lastCompletedSession.split_breakdown.cash} + UPI: ₹{lastCompletedSession.split_breakdown.upi})
                </span>
              )}
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-100 gap-1.5 self-start sm:self-auto"
            onClick={() => setEditPaymentSession(lastCompletedSession)}
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            Change Payment Mode
          </Button>
        </div>
      )}

      {/* Station Quick Filter, Category Tabs & Search Bar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 p-2.5 bg-black/40 border border-white/10 rounded-xl">
        <div className="flex flex-wrap items-center gap-1.5 bg-black/40 border border-white/10 p-1 rounded-lg">
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

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          {/* Category Filter Tabs */}
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'all' ? 'bg-white/10 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Zones
          </button>
          <button
            onClick={() => setCategoryFilter('ps5')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'ps5' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎮 PS5
          </button>
          <button
            onClick={() => setCategoryFilter('sim')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'sim' ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🏎️ Sim
          </button>
          <button
            onClick={() => setCategoryFilter('pool')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'pool' ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🎱 Pool
          </button>
          <button
            onClick={() => setCategoryFilter('pc')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'pc' ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            💻 PC
          </button>
          <button
            onClick={() => setCategoryFilter('vr')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              categoryFilter === 'vr' ? 'bg-purple-500/20 text-purple-400 font-bold border border-purple-500/30' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🥽 VR
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
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
                          onStopClick={(session) => handleOpenStopModal(station, session)}
                          onAddFoodClick={(session) => setFoodModalSession(session)}
                          onStationUpdated={loadData}
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
        onClose={handleCloseStopModal}
        onStop={handleStopComplete}
        stopTime={stopModalSession?.stopTime}
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

      <EditPaymentModal
        open={!!editPaymentSession}
        session={editPaymentSession}
        onClose={() => setEditPaymentSession(null)}
        onUpdated={() => {
          loadData();
          if (lastCompletedSession && editPaymentSession?.id === lastCompletedSession.id) {
            db.sessions.getById(lastCompletedSession.id).then((s: Session | undefined) => s && setLastCompletedSession(s));
          }
        }}
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
  onAddFoodClick,
  onStationUpdated
}: { 
  station: Station, 
  rules: PricingRule[], 
  allGames: Game[], 
  now: number, 
  onMove: (dir: 'left' | 'right') => void,
  onStartClick: () => void, 
  onTransferClick: (session: Session) => void,
  onStopClick: (session: Session) => void, 
  onAddFoodClick: (session: Session) => void,
  onStationUpdated?: () => void
}) {
  const isRunning = station.status === 'occupied' || station.status === 'paused';
  const isMaintenance = station.status === 'maintenance';
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const isPaused = station.status === 'paused' || !!activeSession?.is_paused;
  const [elapsed, setElapsed] = useState<string>('00:00:00');
  const [currentCost, setCurrentCost] = useState<number>(0);
  const [isHappyHour, setIsHappyHour] = useState(false);

  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (isRunning) {
      db.sessions.getActiveByStation(station.id).then(session => {
        if (session && session.status === 'active') {
          setActiveSession(session);
          if (session.customer_id) {
            db.customers.getById(session.customer_id).then(c => setCustomer(c || null));
          } else {
            setCustomer(null);
          }
        } else {
          setActiveSession(null);
          setCustomer(null);
          // Auto-heal: If station says occupied/paused but no active session exists, mark it free
          db.stations.update(station.id, { status: 'free' }).then(() => {
            onStationUpdated?.();
          });
        }
      });
    } else {
      setActiveSession(null);
      setCustomer(null);
    }
  }, [isRunning, station.id]);

  useEffect(() => {
    if (!activeSession) return;
    
    const effectiveNow = isPaused && activeSession.paused_at ? activeSession.paused_at : now;
    const totalPaused = activeSession.total_paused_ms || 0;
    const diffMs = Math.max(0, effectiveNow - Number(activeSession.start_time) - totalPaused);
    
    // Elapsed format
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
    setElapsed(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);

    // Basic Cost calc
    let tempCost = 0;
    const effectiveEndTime = Number(activeSession.start_time) + diffMs;
    if (activeSession.combo_id) {
      tempCost = activeSession.base_amount || 0; 
    } else {
      const customerFreeMins = customer ? customer.available_minutes : 0;
      const totalFreeMins = (activeSession.prepaid_duration_mins || 0) + customerFreeMins;
      const res = calculateDynamicCost(Number(activeSession.start_time), effectiveEndTime, station, rules, totalFreeMins, activeSession.num_players, activeSession.pricing_snapshot);
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
  }, [activeSession, station, rules, customer, now, isPaused]);

  const handleTogglePause = async () => {
    if (!activeSession) return;
    if (isPaused) {
      const currentNow = Date.now();
      const pauseDuration = activeSession.paused_at ? Math.max(0, currentNow - activeSession.paused_at) : 0;
      const newTotalPaused = (activeSession.total_paused_ms || 0) + pauseDuration;
      await db.sessions.update(activeSession.id, {
        is_paused: false,
        paused_at: null,
        checkout_paused: false,
        total_paused_ms: newTotalPaused
      });
      await db.stations.update(station.id, { status: 'occupied' });
      setActiveSession({
        ...activeSession,
        is_paused: false,
        paused_at: null,
        checkout_paused: false,
        total_paused_ms: newTotalPaused
      });
      toast.success(`${station.name} resumed`);
      onStationUpdated?.();
    } else {
      const currentNow = Date.now();
      await db.sessions.update(activeSession.id, {
        is_paused: true,
        paused_at: currentNow,
        checkout_paused: false
      });
      await db.stations.update(station.id, { status: 'paused' });
      setActiveSession({
        ...activeSession,
        is_paused: true,
        paused_at: currentNow,
        checkout_paused: false
      });
      toast.info(`${station.name} paused`);
      onStationUpdated?.();
    }
  };

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

  const startTimeFormatted = activeSession?.start_time ? new Date(Number(activeSession.start_time)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!isMaintenance ? { scale: 1.01 } : {}}
      transition={{ duration: 0.2 }}
      className="min-w-0 w-full"
    >
      <Card className={`h-full bg-black/40 backdrop-blur-md text-card-foreground flex flex-col shadow-lg transition-all duration-300 min-w-0 ${
        isMaintenance ? 'opacity-50 grayscale border-dashed border-red-500/30 pointer-events-none cursor-not-allowed' :
        isPaused ? 'border-amber-500/40 hover:border-amber-500/70 shadow-amber-950/20' :
        'border-white/10 hover:border-indigo-500/50'
      }`}>
        <CardHeader className="p-3 pb-2.5 border-b border-white/5 space-y-0">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 truncate min-w-0 flex-1">
              <Gamepad2 className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{station.name}</span>
            </CardTitle>
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center bg-black/40 border border-white/10 rounded px-0.5 py-0.5">
                <button 
                  onClick={() => onMove('left')} 
                  className="text-[10px] text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                  title="Move Left"
                >
                  ⬅️
                </button>
                <button 
                  onClick={() => onMove('right')} 
                  className="text-[10px] text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                  title="Move Right"
                >
                  ➡️
                </button>
              </div>
              {isRunning && activeSession?.reminders_sent && activeSession.reminders_sent.length > 0 && (
                <div className="flex gap-1">
                  {activeSession.reminders_sent.map(r => (
                    <span key={r} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-bold uppercase">{r}</span>
                  ))}
                </div>
              )}
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                isPaused ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                isRunning ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 
                isMaintenance ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                {isPaused ? 'PAUSED' : station.status}
              </span>
            </div>
          </div>
          {!isRunning && isHappyHour && (
            <div className="pt-1">
              <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-500 uppercase font-bold tracking-wider animate-pulse inline-block">Happy Hour</span>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="p-3 py-3 flex-1 flex flex-col justify-between min-w-0">
          {isRunning ? (
            <div className="space-y-2.5 min-w-0">
              {/* Customer Profile Banner on Active Station */}
              <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between shadow-sm min-w-0">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold text-[10px] uppercase shrink-0">
                    {customer ? customer.name.charAt(0) : 'W'}
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <div className="text-xs font-bold text-indigo-200 truncate">
                      {customer ? customer.name : 'Walk-in Customer'}
                    </div>
                    {customer?.phone ? (
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {customer.phone}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground italic truncate">No profile attached</div>
                    )}
                  </div>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${
                  customer ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-white/5 border-white/10 text-muted-foreground'
                }`}>
                  {customer ? 'Member' : 'Walk-in'}
                </span>
              </div>

              {/* Selected / Running Game Display */}
              {runningGames.length > 0 ? (
                <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex flex-col gap-1 shadow-sm shadow-cyan-950/50 min-w-0">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-300">
                    <span className="flex items-center gap-1 tracking-wider uppercase font-mono text-[9px]">
                      <Gamepad2 className="w-3 h-3 text-cyan-400 shrink-0" />
                      Running Game
                    </span>
                    {activeSession?.num_players ? (
                      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 font-mono shrink-0">
                        <Users className="w-2.5 h-2.5 text-cyan-400" /> {activeSession.num_players}P
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {runningGames.map((gameName, idx) => (
                      <span 
                        key={idx} 
                        className="px-2 py-0.5 text-[11px] font-bold rounded bg-gradient-to-r from-cyan-500 to-emerald-500 text-black shadow-sm tracking-wide truncate max-w-full"
                      >
                        {gameName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-md bg-white/5 border border-white/5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 truncate">
                    <Gamepad2 className="w-3 h-3 opacity-60 shrink-0" />
                    No Game Tagged
                  </span>
                  {activeSession?.num_players ? (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Users className="w-3 h-3" /> {activeSession.num_players}P
                    </span>
                  ) : null}
                </div>
              )}

              {/* Started On Banner */}
              <div className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-white/5 border border-white/5">
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                  <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                  Started on
                </span>
                <span className="font-mono text-xs font-bold text-indigo-200">
                  {startTimeFormatted || 'Just now'}
                </span>
              </div>

              {/* Paused Notification Banner */}
              {isPaused && (
                <div className="p-1.5 px-2 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300 font-semibold animate-pulse">
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <Pause className="w-3 h-3 text-amber-400 shrink-0" />
                    Session Paused
                  </span>
                  <span className="text-[9px] uppercase font-mono tracking-wider text-amber-400/90">Timer Frozen</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-muted-foreground text-xs font-medium">Session Time</span>
                <span className={`font-mono text-lg font-bold tracking-tight ${isPaused ? 'text-amber-300' : 'text-white'}`}>
                  {elapsed}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">Current Cost</span>
                <span className={`font-mono text-xl font-bold ${isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
                  ₹ {currentCost.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[160px] flex flex-col justify-center items-center text-muted-foreground py-4">
              <span className="text-2xl font-light mb-0.5 text-white">₹ {station.hourly_rate}</span>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Per Hour</span>

              {installedGameNames.length > 0 && (
                <div className="mt-3 text-center">
                  <span className="text-[10px] text-cyan-400/90 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full font-medium">
                    {installedGameNames.length} games installed
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="p-3 pt-2.5 border-t border-white/5 flex flex-col gap-2 min-w-0">
          {!isRunning ? (
            <Button disabled={isMaintenance} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 h-9" onClick={onStartClick}>
              <Play className="w-4 h-4 mr-1.5" /> Start Session
            </Button>
          ) : (
            <div className="w-full space-y-2 min-w-0">
              {/* Row 1: Extensions + Pause/Resume toggle */}
              <div className="grid grid-cols-3 gap-1.5">
                <Button variant="outline" className="border-white/10 hover:bg-white/5 text-[11px] h-7 px-1 text-indigo-300 font-medium" onClick={() => handleExtend(30)}>
                  +30m
                </Button>
                <Button variant="outline" className="border-white/10 hover:bg-white/5 text-[11px] h-7 px-1 text-indigo-300 font-medium" onClick={() => handleExtend(60)}>
                  +1h
                </Button>
                <Button 
                  variant="outline" 
                  className={`text-[11px] h-7 px-1.5 font-medium flex items-center justify-center gap-1 transition-colors ${
                    isPaused 
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' 
                      : 'border-white/10 hover:bg-white/5 text-amber-400'
                  }`} 
                  onClick={handleTogglePause}
                  title={isPaused ? "Resume Session" : "Pause Session"}
                >
                  {isPaused ? <Play className="w-3 h-3 fill-current shrink-0" /> : <Pause className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{isPaused ? 'Resume' : 'Pause'}</span>
                </Button>
              </div>

              {/* Row 2: Utilities (Bell, Transfer) + Actions (Item, Stop) */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Button variant="outline" title="WhatsApp Reminder" size="sm" className="h-8 w-8 p-0 shrink-0 border-white/10 hover:bg-white/5 text-blue-400" onClick={handleManualReminder}>
                  <Bell className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" title="Transfer Station / Players" size="sm" className="h-8 w-8 p-0 shrink-0 border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300" onClick={() => activeSession && onTransferClick(activeSession)}>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 border-white/10 hover:bg-white/5 text-xs px-2 min-w-0 font-medium" onClick={() => activeSession && onAddFoodClick(activeSession)}>
                  <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="truncate">Item</span>
                </Button>
                <Button variant="destructive" size="sm" className="flex-1 h-8 bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20 text-xs px-2 min-w-0 font-semibold" onClick={() => activeSession && onStopClick(activeSession)}>
                  <Square className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="truncate">Stop</span>
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
