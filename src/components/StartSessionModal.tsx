import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Station, Customer, MenuItem, Game } from '../types';
import { X } from 'lucide-react';
import { calculateDynamicCost } from '../lib/pricing';

interface StartSessionModalProps {
  station: Station | null;
  onClose: () => void;
  onStart: () => void;
}

export function StartSessionModal({ station, onClose, onStart }: StartSessionModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [combos, setCombos] = useState<MenuItem[]>([]);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [selectedComboId, setSelectedComboId] = useState<string>('none');
  const [isPrepaid, setIsPrepaid] = useState(false);
  const [prepaidHours, setPrepaidHours] = useState('0');
  const [prepaidMinutes, setPrepaidMinutes] = useState('0');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [delaySecs, setDelaySecs] = useState<number>(0);
  const [games, setGames] = useState<{game: Game, available: number}[]>([]);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [numPlayers, setNumPlayers] = useState<number>(1);

  useEffect(() => {
    if (station) {
      db.customers.getAll().then(setCustomers);
      db.menu.getAll().then(items => {
        setCombos(items.filter(i => i.category === 'combo' && i.active));
      });
      db.settings.get().then(settings => {
        setDelaySecs(settings.session_start_delay_sec || 0);
      });
      Promise.all([db.games.getAll(), db.sessions.getAll()]).then(([allGames, allSessions]) => {
        const activeSessions = allSessions.filter(s => s.status === 'active');
        
        const stationGames = station.installed_games 
          ? allGames.filter(g => station.installed_games!.includes(g.id))
          : allGames;

        const availableGames = stationGames.map(game => {
          const inUse = activeSessions.reduce((count, s) => {
            return count + (s.game_ids?.includes(game.id) ? 1 : 0);
          }, 0);
          return { game, available: Math.max(0, game.total_copies - inUse) };
        });
        setGames(availableGames);
      });
    } else {
      setCountdown(null);
    }
  }, [station]);

  const executeStart = async () => {
    if (!station) return;
    try {
      const selectedCombo = combos.find(c => c.id === selectedComboId);
      
      const prepaidDuration = isPrepaid ? (parseInt(prepaidHours) || 0) * 60 + (parseInt(prepaidMinutes) || 0) : null;
      let baseAmount = selectedCombo ? selectedCombo.price : 0;
      if (!selectedCombo && prepaidDuration) {
        const { cost } = calculateDynamicCost(0, prepaidDuration * 60000, station, [], 0, numPlayers);
        baseAmount = cost;
      }
      
      await db.sessions.add({
        station_id: station.id,
        customer_id: selectedCustomerId === 'walk-in' ? null : selectedCustomerId,
        start_time: Date.now(),
        end_time: null,
        prepaid_duration_mins: prepaidDuration,
        combo_id: selectedCombo ? selectedCombo.id : null,
        orders: [],
        base_amount: baseAmount,
        overtime_amount: 0,
        food_amount: 0,
        total_amount: 0,
        payment_mode: null,
        status: 'active',
        game_ids: selectedGameIds,
        num_players: station.type.startsWith('ps5') ? numPlayers : undefined
      });

      await db.stations.update(station.id, { status: 'occupied' });
      onStart();
      onClose();
      setSelectedGameIds([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setCountdown(null);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    if (delaySecs > 0) {
      let current = delaySecs;
      setCountdown(current);
      
      const interval = setInterval(() => {
        current -= 1;
        if (current <= 0) {
          clearInterval(interval);
          executeStart();
        } else {
          setCountdown(current);
        }
      }, 1000);
    } else {
      executeStart();
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredCustomers = customers.filter(c => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase().replace(/\s+/g, '');
    const name = c.name.toLowerCase().replace(/\s+/g, '');
    const phone = c.phone.replace(/\s+/g, '');
    
    // Super basic fuzzy: check if search string chars exist in order
    let matchIndex = 0;
    for (let i = 0; i < name.length; i++) {
      if (name[i] === search[matchIndex]) matchIndex++;
      if (matchIndex === search.length) return true;
    }
    return phone.includes(search);
  });

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Session: {station?.name}</DialogTitle>
        </DialogHeader>
        
        {countdown !== null ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-24 h-24 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin flex items-center justify-center relative">
              <span className="absolute text-3xl font-black text-indigo-400 animate-pulse" style={{ animationDuration: '1s' }}>
                {countdown}
              </span>
            </div>
            <p className="text-xl font-bold uppercase tracking-widest text-indigo-300">Starting Session...</p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>Customer</Label>
              
              {/* Distinct Walk-in Button */}
              <button 
                onClick={() => setSelectedCustomerId('walk-in')}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                  selectedCustomerId === 'walk-in' 
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:bg-black/40 hover:border-white/20'
                }`}
              >
                <div className="font-medium text-base">Walk-in Customer</div>
                <div className="text-xs opacity-70">No profile attached to this session</div>
              </button>

              <div className="relative mt-4">
                <Input 
                  placeholder="Or search registered customer by name/phone..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-white/10 bg-black/20 text-sm"
                />
              </div>
              
              <div className="border border-white/5 rounded-lg bg-black/20 max-h-32 overflow-y-auto mt-2">
                {filteredCustomers.map(c => (
                  <div 
                    key={c.id} 
                    className={`p-3 text-sm cursor-pointer transition-colors border-b border-white/5 last:border-0 ${
                      selectedCustomerId === c.id 
                        ? 'bg-indigo-500/20 text-indigo-300 font-medium' 
                        : 'hover:bg-white/5 text-foreground'
                    }`}
                    onClick={() => setSelectedCustomerId(c.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span>{c.name}</span>
                      <span className={`text-xs ${selectedCustomerId === c.id ? 'text-indigo-400/70' : 'text-muted-foreground'}`}>{c.phone}</span>
                    </div>
                  </div>
                ))}
                {searchQuery && filteredCustomers.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">No matches found.</div>
                )}
              </div>
            </div>

          <div className="flex items-center justify-between border border-border p-3 rounded-md bg-background/50">
            <div className="space-y-0.5">
              <Label>Prepaid Session</Label>
              <p className="text-[10px] text-muted-foreground">Fixed duration instead of open tab</p>
            </div>
            <input 
              type="checkbox"
              checked={isPrepaid}
              onChange={(e) => setIsPrepaid(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 bg-background border-border rounded cursor-pointer"
            />
          </div>

          {isPrepaid && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input 
                  type="number" min="0" 
                  value={prepaidHours} onChange={(e) => setPrepaidHours(e.target.value)} 
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Minutes</Label>
                <Input 
                  type="number" min="0" max="59" 
                  value={prepaidMinutes} onChange={(e) => setPrepaidMinutes(e.target.value)} 
                  className="bg-background border-border"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="combo">Select Combo (Optional)</Label>
            <Select value={selectedComboId} onValueChange={setSelectedComboId}>
              <SelectTrigger id="combo" className="border-border">
                <SelectValue placeholder="No Combo (Standard Hourly Rate)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard Hourly Rate (₹ {station?.hourly_rate}/hr)</SelectItem>
                {combos.map(combo => (
                  <SelectItem key={combo.id} value={combo.id}>
                    {combo.name} - ₹ {combo.price}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {station?.type.startsWith('ps5') && (
            <div className="space-y-2">
              <Label htmlFor="players">Number of Players</Label>
              <Select value={numPlayers.toString()} onValueChange={(v) => setNumPlayers(parseInt(v))}>
                <SelectTrigger id="players" className="border-border">
                  <SelectValue placeholder="Select Players" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Player</SelectItem>
                  <SelectItem value="2">2 Players</SelectItem>
                  <SelectItem value="3">3 Players</SelectItem>
                  <SelectItem value="4">4 Players</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {games.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <Label>Attach Games (Optional)</Label>
              <div className="flex flex-wrap gap-2">
                {games.map(g => {
                  const isSelected = selectedGameIds.includes(g.game.id);
                  const canSelect = g.available > 0 || isSelected;
                  
                  if (!canSelect && !isSelected) return null;
                  
                  return (
                    <button
                      key={g.game.id}
                      type="button"
                      disabled={!canSelect}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedGameIds(prev => prev.filter(id => id !== g.game.id));
                        } else {
                          setSelectedGameIds(prev => [...prev, g.game.id]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-md text-sm transition-all border flex items-center gap-1 ${
                        isSelected 
                          ? 'bg-indigo-500 text-white border-indigo-600' 
                          : 'bg-black/20 text-muted-foreground border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {g.game.name}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-border">Cancel</Button>
          <Button onClick={handleStart} disabled={loading || countdown !== null} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading && countdown === null ? 'Starting...' : 'Start Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
