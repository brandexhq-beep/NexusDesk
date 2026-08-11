import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';

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
      
      await db.games.add(payload);
      onAdd();
      onClose();
      setName('');
      setCopies('1');
      setCategory('');
      setActive(true);
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

          <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-background/50">
            <div className="space-y-0.5 flex-1">
              <Label className="text-base cursor-pointer" htmlFor="active-status">Active Status</Label>
              <div className="text-sm text-muted-foreground">
                Is this game currently available?
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
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Game'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
