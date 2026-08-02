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

  useEffect(() => {
    db.games.getAll().then(setGames);
  }, []);

  useEffect(() => {
    if (station) {
      setName(station.name);
      setHourlyRate(station.hourly_rate.toString());
      setGracePeriod(station.grace_period_minutes?.toString() || '0');
      setInstalledGames(station.installed_games || []);
    }
  }, [station]);

  const handleSave = async () => {
    if (!station) return;
    setLoading(true);
    try {
      await db.stations.update(station.id, {
        name,
        hourly_rate: Number(hourlyRate),
        grace_period_minutes: Number(gracePeriod),
        installed_games: installedGames
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
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Station</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4 h-96 overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Station Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Hourly Rate</Label>
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
