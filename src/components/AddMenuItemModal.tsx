import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { MenuCategory } from '../types';

interface AddMenuItemModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
}

export function AddMenuItemModal({ open, onClose, onAdd }: AddMenuItemModalProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<MenuCategory>('snack');
  const [stock, setStock] = useState('0');
  const [subcategory, setSubcategory] = useState('');
  const [playerCount, setPlayerCount] = useState('');
  const [packageMinutes, setPackageMinutes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    
    setLoading(true);
    try {
      const payload: any = {
        name: name.trim(),
        price: Number(price),
        category,
        active: true
      };
      
      if (subcategory.trim()) {
        payload.subcategory = subcategory.trim();
      }
      
      if (category === 'snack' || category === 'drink') {
        payload.stock_quantity = Number(stock) || 0;
      }
      
      if (category === 'package') {
        if (playerCount) payload.player_count = Number(playerCount);
        if (packageMinutes) payload.package_minutes = Number(packageMinutes);
      }

      await db.menu.add(payload);
      onAdd();
      onClose();
      // Reset form
      setName('');
      setPrice('');
      setCategory('snack');
      setStock('0');
      setSubcategory('');
      setPlayerCount('');
      setPackageMinutes('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Menu Item</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item Name</Label>
            <Input 
              id="name" 
              placeholder="e.g. Red Bull" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="border-border bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price (₹)</Label>
            <Input 
              id="price" 
              type="number" 
              placeholder="0.00" 
              value={price} 
              onChange={e => setPrice(e.target.value)} 
              className="border-border bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={(val: MenuCategory) => setCategory(val)}>
              <SelectTrigger id="category" className="border-border bg-background">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="snack">Snack</SelectItem>
                <SelectItem value="drink">Drink</SelectItem>
                <SelectItem value="combo">Combo</SelectItem>
                <SelectItem value="package">Package / Service</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategory / Group (Optional)</Label>
            <Input 
              id="subcategory" 
              placeholder="e.g. PS5 GAMING" 
              value={subcategory} 
              onChange={e => setSubcategory(e.target.value)} 
              className="border-border bg-background"
            />
          </div>

          {(category === 'snack' || category === 'drink') && (
            <div className="space-y-2">
              <Label htmlFor="stock">Initial Stock</Label>
              <Input 
                id="stock" 
                type="number" 
                min="0"
                placeholder="0" 
                value={stock} 
                onChange={e => setStock(e.target.value)} 
                className="border-border bg-background"
              />
            </div>
          )}

          {category === 'package' && (
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <Label htmlFor="packageMinutes">Duration (Mins)</Label>
                <Input 
                  id="packageMinutes" 
                  type="number" 
                  min="0"
                  placeholder="60" 
                  value={packageMinutes} 
                  onChange={e => setPackageMinutes(e.target.value)} 
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label htmlFor="playerCount">Players</Label>
                <Input 
                  id="playerCount" 
                  type="number" 
                  min="1"
                  placeholder="1" 
                  value={playerCount} 
                  onChange={e => setPlayerCount(e.target.value)} 
                  className="border-border bg-background"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? 'Saving...' : 'Save Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
