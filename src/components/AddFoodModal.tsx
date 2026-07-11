import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { db } from '../services/db';
import type { Session, MenuItem } from '../types';

interface AddFoodModalProps {
  session: Session | null;
  onClose: () => void;
  onAdd: () => void;
}

export function AddFoodModal({ session, onClose, onAdd }: AddFoodModalProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      db.menu.getAll().then(data => {
        setItems(data.filter(i => i.active && i.category !== 'combo'));
      });
    }
  }, [session]);

  const handleAddItem = async (item: MenuItem) => {
    if (!session) return;
    setLoading(true);
    try {
      const newOrder = {
        item_id: item.id,
        name: item.name,
        quantity: 1,
        price_at_order: item.price
      };
      
      const existingOrderIndex = session.orders.findIndex(o => o.item_id === item.id);
      let updatedOrders = [...session.orders];
      
      if (existingOrderIndex >= 0) {
        updatedOrders[existingOrderIndex].quantity += 1;
      } else {
        updatedOrders.push(newOrder);
      }

      await db.sessions.update(session.id, { orders: updatedOrders });
      onAdd();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Food / Drink</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => handleAddItem(item)}
              disabled={loading}
              className="flex flex-col items-center justify-center p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors text-center disabled:opacity-50"
            >
              <span className="font-medium text-sm text-foreground">{item.name}</span>
              <span className="text-muted-foreground text-xs mt-1">₹ {item.price}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No active menu items available.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border w-full">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
