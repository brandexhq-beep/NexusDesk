import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Station } from '../types';

interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
}

export function AddGameModal({ open, onClose, onAdd }: AddGameModalProps) {
  const [name, setName] = useState('');
  const [copies, setCopies] = useState('1');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      db.stations.getAll().then(setStations);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        name,
        total_copies: parseInt(copies, 10),
        active
      };
      if (category.trim()) {
        payload.category = category.trim();
      }
      
      const newGame = await db.games.add(payload);
      
      // Update stations if any selected
      if (selectedStationIds.length > 0 && newGame?.id) {
        for (const st of stations) {
          const isSelected = selectedStationIds.includes(st.id);
          const currentList = st.installed_games || [];
          if (isSelected && !currentList.includes(newGame.id)) {
            await db.stations.update(st.id, { installed_games: [...currentList, newGame.id] });
          }
        }
      }

      onAdd();
      onClose();
      setName('');
      setCopies('1');
      setCategory('');
      setActive(true);
      setSelectedStationIds([]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Game</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Game Name</Label>
            <Input
              id="name"
              placeholder="e.g. FIFA 24"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category (Optional)</Label>
            <Input
              id="category"
              placeholder="e.g. MULTIPLAYER"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="copies">Total Copies</Label>
            <Input
              id="copies"
              type="number"
              min="1"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              required
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Install on Stations (Optional)</Label>
            <p className="text-[11px] text-muted-foreground">Select which station units have this game installed.</p>
            <div className="grid grid-cols-2 gap-2 border border-white/10 rounded-lg p-2.5 bg-black/20 max-h-32 overflow-y-auto">
              {stations.map(st => (
                <label key={st.id} className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedStationIds.includes(st.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStationIds(prev => [...prev, st.id]);
                      } else {
                        setSelectedStationIds(prev => prev.filter(id => id !== st.id));
                      }
                    }}
                    className="w-3.5 h-3.5 accent-indigo-600 rounded bg-background border-border cursor-pointer"
                  />
                  <span className="truncate">{st.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-background/50">
            <div className="space-y-0.5 flex-1">
              <Label className="text-base cursor-pointer" htmlFor="active-status">Active Status</Label>
              <div className="text-sm text-muted-foreground">
                Is this game currently active and playable?
              </div>
            </div>
            <input 
              id="active-status"
              type="checkbox" 
              checked={active} 
              onChange={(e) => setActive(e.target.checked)}
              className="w-5 h-5 accent-indigo-600 bg-background border-border rounded cursor-pointer"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-border">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading ? 'Adding...' : 'Add Game'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
