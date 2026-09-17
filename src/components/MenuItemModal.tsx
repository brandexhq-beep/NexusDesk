import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { MenuItem, MenuCategory } from '../types';

interface MenuItemModalProps {
  open: boolean;
  item?: MenuItem | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export function MenuItemModal({ open, item, onClose, onSaveSuccess }: MenuItemModalProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<MenuCategory>('snack');
  const [stock, setStock] = useState('0');
  const [subcategory, setSubcategory] = useState('');
  const [playerCount, setPlayerCount] = useState('');
  const [packageMinutes, setPackageMinutes] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState('₹');

  useEffect(() => {
    db.settings.get().then(s => setCurrency(s.currency_symbol || '₹'));
  }, []);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setPrice(item.price?.toString() || '');
      setCategory(item.category || 'snack');
      setStock(item.stock_quantity?.toString() || '0');
      setSubcategory(item.subcategory || '');
      setPlayerCount(item.player_count?.toString() || '');
      setPackageMinutes(item.package_minutes?.toString() || '');
      setActive(item.active !== false);
    } else {
      setName('');
      setPrice('');
      setCategory('snack');
      setStock('0');
      setSubcategory('');
      setPlayerCount('');
      setPackageMinutes('');
      setActive(true);
    }
  }, [item, open]);

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    
    setLoading(true);
    try {
      const payload: any = {
        name: name.trim(),
        price: Number(price) || 0,
        category,
        active
      };
      
      if (subcategory.trim()) {
        payload.subcategory = subcategory.trim();
      } else {
        payload.subcategory = null;
      }
      
      if (category === 'snack' || category === 'drink') {
        payload.stock_quantity = Number(stock) || 0;
        payload.low_stock_notified = false;
      }
      
      if (category === 'package') {
        if (playerCount) payload.player_count = Number(playerCount);
        if (packageMinutes) payload.package_minutes = Number(packageMinutes);
      }

      if (item) {
        await db.menu.update(item.id, payload);
      } else {
        await db.menu.add(payload);
      }

      onSaveSuccess();
      onClose();
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
          <DialogTitle>{item ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <Input 
              id="item-name" 
              placeholder="e.g. Red Bull / French Fries" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="border-border bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-price">Price ({currency})</Label>
            <Input 
              id="item-price" 
              type="number" 
              min="0"
              placeholder="0.00" 
              value={price} 
              onChange={e => setPrice(e.target.value)} 
              className="border-border bg-background font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-category">Category</Label>
            <Select value={category} onValueChange={(val: MenuCategory) => setCategory(val)}>
              <SelectTrigger id="item-category" className="border-border bg-background capitalize">
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
            <Label htmlFor="item-subcategory">Subcategory / Group (Optional)</Label>
            <Input 
              id="item-subcategory" 
              placeholder="e.g. PS5 GAMING, FRIES & SNACKS" 
              value={subcategory} 
              onChange={e => setSubcategory(e.target.value)} 
              className="border-border bg-background"
            />
          </div>

          {(category === 'snack' || category === 'drink') && (
            <div className="space-y-2">
              <Label htmlFor="item-stock">Stock Quantity</Label>
              <Input 
                id="item-stock" 
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
                <Label htmlFor="item-packageMinutes">Duration (Mins)</Label>
                <Input 
                  id="item-packageMinutes" 
                  type="number" 
                  min="0"
                  placeholder="60" 
                  value={packageMinutes} 
                  onChange={e => setPackageMinutes(e.target.value)} 
                  className="border-border bg-background"
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label htmlFor="item-playerCount">Players</Label>
                <Input 
                  id="item-playerCount" 
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

          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="item-active" className="cursor-pointer">Active in Menu</Label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                id="item-active"
                type="checkbox" 
                className="sr-only peer" 
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? 'Saving...' : item ? 'Update Item' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
