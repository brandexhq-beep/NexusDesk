import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Station } from '../types';
import { Trash2 } from 'lucide-react';

interface EditStationModalProps {
  station: Station | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditStationModal({ station, onClose, onUpdate }: EditStationModalProps) {
  const [name, setName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [installedGames, setInstalledGames] = useState<string[]>([]);
  const [games, setGames] = useState<import('../types').Game[]>([]);
  const [loading, setLoading] = useState(false);

  const [rate30m, setRate30m] = useState('');
  const [rate2P, setRate2P] = useState('');
  const [rate3P, setRate3P] = useState('');
  const [rate4P, setRate4P] = useState('');

  useEffect(() => {
    db.games.getAll().then(setGames);
  }, []);

  useEffect(() => {
    if (station) {
      setName(station.name);
      setHourlyRate(station.hourly_rate.toString());
      setRate30m(station.rate_30min?.toString() || '');
      setGracePeriod(station.grace_period_minutes?.toString() || '0');
      setInstalledGames(station.installed_games || []);
      setRate2P(station.player_rates?.[2]?.toString() || '');
      setRate3P(station.player_rates?.[3]?.toString() || '');
      setRate4P(station.player_rates?.[4]?.toString() || '');
    }
  }, [station]);

  const handleSave = async () => {
    if (!station) return;
    setLoading(true);
    try {
      const p1Rate = Number(hourlyRate) || 0;
      const player_rates: Record<number, number> = {
        1: p1Rate,
      };
      if (rate2P) player_rates[2] = Number(rate2P);
      if (rate3P) player_rates[3] = Number(rate3P);
      if (rate4P) player_rates[4] = Number(rate4P);

      await db.stations.update(station.id, {
        name,
        hourly_rate: p1Rate,
        rate_30min: rate30m ? Number(rate30m) : undefined,
        grace_period_minutes: Number(gracePeriod),
        installed_games: installedGames,
        player_rates
      });
      onUpdate();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!station) return;
    if (confirm(`Are you sure you want to completely delete "${station.name}"?`)) {
      setLoading(true);
      try {
        await db.stations.delete(station.id);
        onUpdate();
        onClose();
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Station Configuration</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4 max-h-[75vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Station Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="bg-background border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>1 Player Hourly Rate (Base)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                <Input 
                  type="number" min="0" step="1" 
                  value={hourlyRate} 
                  onChange={(e) => setHourlyRate(e.target.value)} 
                  className="bg-background border-border pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>30-Min Rate (Optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                <Input 
                  type="number" min="0" step="1" 
                  placeholder="e.g. 200"
                  value={rate30m} 
                  onChange={(e) => setRate30m(e.target.value)} 
                  className="bg-background border-border pl-7"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Used for 30-min flat rate (VR / Sim Racing).</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <Label className="text-xs font-bold uppercase tracking-wider text-indigo-400">Multiplayer Hourly Rate Matrix (₹ / Hr)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">2 Players</span>
                <Input 
                  type="number" min="0"
                  placeholder="e.g. 280"
                  value={rate2P}
                  onChange={e => setRate2P(e.target.value)}
                  className="bg-background border-border text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">3 Players</span>
                <Input 
                  type="number" min="0"
                  placeholder="e.g. 380"
                  value={rate3P}
                  onChange={e => setRate3P(e.target.value)}
                  className="bg-background border-border text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">4 Players</span>
                <Input 
                  type="number" min="0"
                  placeholder="e.g. 450"
                  value={rate4P}
                  onChange={e => setRate4P(e.target.value)}
                  className="bg-background border-border text-xs"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Grace Period (Minutes)</Label>
            <div className="relative">
              <Input 
                type="number" min="0" step="1" 
                value={gracePeriod} 
                onChange={(e) => setGracePeriod(e.target.value)} 
                className="bg-background border-border pr-12"
              />
              <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">mins</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Free time before billing starts.</p>
          </div>

          <div className="space-y-2">
            <Label>Installed Games (Optional)</Label>
            <p className="text-[10px] text-muted-foreground">Select which games are available on this station.</p>
            <div className="grid grid-cols-2 gap-2 border border-white/5 rounded-md p-3 bg-black/20 max-h-48 overflow-y-auto">
              {games.filter(g => g.active).map(game => (
                <label key={game.id} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox"
                    checked={installedGames.includes(game.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setInstalledGames([...installedGames, game.id]);
                      } else {
                        setInstalledGames(installedGames.filter(id => id !== game.id));
                      }
                    }}
                    className="rounded border-white/20 bg-black/40 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground group-hover:text-white transition-colors">{game.name}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4">
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>

          {station?.status === 'occupied' ? (
            <div className="text-center mt-2">
              <p className="text-[10px] text-red-400 font-medium">Cannot delete a station with an active session.</p>
              <Button disabled variant="outline" className="w-full border-red-500/20 text-red-500/50 mt-1">
                Delete Station
              </Button>
            </div>
          ) : (
            <Button onClick={handleDelete} disabled={loading} variant="outline" className="w-full border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 mt-2">
              <Trash2 className="w-4 h-4 mr-2" /> Delete Station
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
