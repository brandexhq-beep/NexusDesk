import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Station, PricingCategory, Game } from '../types';
import { Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';

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
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [rate30m, setRate30m] = useState('');
  const [rate2P, setRate2P] = useState('');
  const [rate3P, setRate3P] = useState('');
  const [rate4P, setRate4P] = useState('');

  const [rate30m1P, setRate30m1P] = useState('');
  const [rate30m2P, setRate30m2P] = useState('');
  const [rate30m3P, setRate30m3P] = useState('');
  const [rate30m4P, setRate30m4P] = useState('');

  useEffect(() => {
    Promise.all([db.games.getAll(), db.pricingCategories.getAll()]).then(([gmData, catData]) => {
      setGames(gmData);
      setCategories(catData);
    });
  }, []);

  useEffect(() => {
    if (station) {
      setName(station.name);
      setSelectedCategoryId(station.pricing_category_id || '');
      setHourlyRate(station.hourly_rate.toString());
      setRate30m(station.rate_30min?.toString() || '');
      setGracePeriod(station.grace_period_minutes?.toString() || '0');
      setInstalledGames(station.installed_games || []);
      setRate2P(station.player_rates?.[2]?.toString() || '');
      setRate3P(station.player_rates?.[3]?.toString() || '');
      setRate4P(station.player_rates?.[4]?.toString() || '');

      setRate30m1P(station.player_rates_30min?.[1]?.toString() || station.rate_30min?.toString() || '');
      setRate30m2P(station.player_rates_30min?.[2]?.toString() || '');
      setRate30m3P(station.player_rates_30min?.[3]?.toString() || '');
      setRate30m4P(station.player_rates_30min?.[4]?.toString() || '');
    }
  }, [station]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategoryId(catId);
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      const catHourly = cat.price_matrix[60]?.[1] || cat.hourly_rate || 200;
      setHourlyRate(catHourly.toString());
      if (cat.price_matrix[30]?.[1]) {
        setRate30m(cat.price_matrix[30][1].toString());
        setRate30m1P(cat.price_matrix[30][1].toString());
      }
      if (cat.price_matrix[60]?.[2]) setRate2P(cat.price_matrix[60][2].toString());
      if (cat.price_matrix[60]?.[3]) setRate3P(cat.price_matrix[60][3].toString());
      if (cat.price_matrix[60]?.[4]) setRate4P(cat.price_matrix[60][4].toString());

      if (cat.price_matrix[30]?.[2]) setRate30m2P(cat.price_matrix[30][2].toString());
      if (cat.price_matrix[30]?.[3]) setRate30m3P(cat.price_matrix[30][3].toString());
      if (cat.price_matrix[30]?.[4]) setRate30m4P(cat.price_matrix[30][4].toString());
    }
  };

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

      const player_rates_30min: Record<number, number> = {};
      if (rate30m1P) player_rates_30min[1] = Number(rate30m1P);
      if (rate30m2P) player_rates_30min[2] = Number(rate30m2P);
      if (rate30m3P) player_rates_30min[3] = Number(rate30m3P);
      if (rate30m4P) player_rates_30min[4] = Number(rate30m4P);

      await db.stations.update(station.id, {
        name,
        pricing_category_id: selectedCategoryId || undefined,
        hourly_rate: p1Rate,
        rate_30min: rate30m1P ? Number(rate30m1P) : (rate30m ? Number(rate30m) : undefined),
        grace_period_minutes: Number(gracePeriod),
        installed_games: installedGames,
        player_rates,
        player_rates_30min: Object.keys(player_rates_30min).length > 0 ? player_rates_30min : undefined,
      });

      toast.success(`Updated station ${name}`);
      onUpdate();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Failed to update station');
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
        toast.success(`Deleted station ${station.name}`);
        onUpdate();
        onClose();
      } catch (e) {
        console.error(e);
        toast.error('Failed to delete station');
      } finally {
        setLoading(false);
      }
    }
  };

  const selectedCat = categories.find(c => c.id === selectedCategoryId);

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Edit Station & Pricing
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-2 pr-1 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs">Station Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="e.g. PS5 Unit 1"
              className="text-xs"
            />
          </div>

          {/* PRICING CATEGORY SELECTOR */}
          <div className="space-y-1.5 bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-lg">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Pricing Category
              </Label>
              {selectedCat && (
                <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded">
                  ₹{selectedCat.price_matrix[60]?.[1] || selectedCat.hourly_rate}/hr
                </span>
              )}
            </div>

            <select
              value={selectedCategoryId}
              onChange={e => handleCategoryChange(e.target.value)}
              className="w-full h-8 rounded-md border border-white/10 bg-black/60 px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Custom / Station Specific Rates</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — ₹{c.price_matrix[60]?.[1] || c.hourly_rate}/hr
                </option>
              ))}
            </select>

            {selectedCat ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                Inherits full rate matrix ({selectedCat.durations.join(', ')} mins, up to {Math.max(...selectedCat.player_counts)} players).
              </p>
            ) : (
              <p className="text-[11px] text-amber-400/80 mt-1">
                Using custom overrides below. Assign a category to automatically inherit unified prices.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Base Hourly Rate (₹)</Label>
              <Input 
                type="number"
                value={hourlyRate} 
                onChange={(e) => setHourlyRate(e.target.value)} 
                placeholder="200"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Grace Period (Mins)</Label>
              <Input 
                type="number"
                value={gracePeriod} 
                onChange={(e) => setGracePeriod(e.target.value)} 
                placeholder="0"
                className="text-xs"
              />
            </div>
          </div>

          {/* 30-min and Multi-player Rates overrides */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rate Overrides (Optional)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">2 Players (₹/hr)</Label>
                <Input
                  type="number"
                  value={rate2P}
                  onChange={e => setRate2P(e.target.value)}
                  placeholder="e.g. 280"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">3 Players (₹/hr)</Label>
                <Input
                  type="number"
                  value={rate3P}
                  onChange={e => setRate3P(e.target.value)}
                  placeholder="e.g. 380"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">4 Players (₹/hr)</Label>
                <Input
                  type="number"
                  value={rate4P}
                  onChange={e => setRate4P(e.target.value)}
                  placeholder="e.g. 450"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Installed Games Selection */}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <Label className="text-xs">Installed Games ({installedGames.length})</Label>
            <div className="max-h-32 overflow-y-auto border border-white/10 rounded-lg p-2 space-y-1 bg-black/20">
              {games.map(game => (
                <label key={game.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={installedGames.includes(game.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setInstalledGames([...installedGames, game.id]);
                      } else {
                        setInstalledGames(installedGames.filter(id => id !== game.id));
                      }
                    }}
                    className="rounded border-white/20 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-xs text-foreground">{game.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/10">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={loading}
            className="text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
            >
              {loading ? 'Saving...' : 'Save Station'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
