import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { db } from '../services/db';
import type { Session, MenuItem, SessionOrder } from '../types';
import { Minus, Plus, ShoppingCart } from 'lucide-react';

interface AddFoodModalProps {
  session: Session | null;
  onClose: () => void;
  onAdd: () => void;
}

export function AddFoodModal({ session, onClose, onAdd }: AddFoodModalProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<SessionOrder[]>([]);
  const [originalCart, setOriginalCart] = useState<SessionOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      db.menu.getAll().then(data => {
        setItems(data.filter(i => i.active && i.category !== 'combo' && i.category !== 'package'));
      });
      // Initialize cart from session
      setCart([...session.orders]);
      setOriginalCart([...session.orders]);
    } else {
      setCart([]);
      setOriginalCart([]);
    }
  }, [session]);

  const getAvailableStock = (item: MenuItem) => {
    const cartItem = cart.find(o => o.item_id === item.id);
    const originalItem = originalCart.find(o => o.item_id === item.id);
    
    const initialStock = item.stock_quantity || 0;
    // The amount they had in cart before they opened the modal doesn't count against current stock 
    // because it was already deducted when they previously saved.
    // So current physical stock = initialStock
    // If they increase quantity, they consume from initialStock.
    // Actually, it's easier to think of remaining allowed to add:
    // Available to add = initialStock - (currentCartQty - originalCartQty)
    
    const qtyInCart = cartItem ? cartItem.quantity : 0;
    const qtyInOriginal = originalItem ? originalItem.quantity : 0;
    
    return initialStock - (qtyInCart - qtyInOriginal);
  };

  const handleAddItem = (item: MenuItem) => {
    if (getAvailableStock(item) <= 0) return;

    const existing = cart.find(o => o.item_id === item.id);
    if (existing) {
      setCart(cart.map(o => o.item_id === item.id ? { ...o, quantity: o.quantity + 1 } : o));
    } else {
      setCart([...cart, { item_id: item.id, name: item.name, quantity: 1, price_at_order: item.price }]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const existing = cart.find(o => o.item_id === itemId);
    if (!existing) return;
    
    const itemDef = items.find(i => i.id === itemId);
    if (delta > 0 && itemDef && getAvailableStock(itemDef) <= 0) {
      return; // Cannot add more than stock
    }

    const newQty = existing.quantity + delta;
    if (newQty <= 0) {
      setCart(cart.filter(o => o.item_id !== itemId));
    } else {
      setCart(cart.map(o => o.item_id === itemId ? { ...o, quantity: newQty } : o));
    }
  };

  const handleSave = async () => {
    if (!session) return;
    setLoading(true);
    try {
      // Calculate deltas and update stock
      for (const item of items) {
        const originalItem = originalCart.find(o => o.item_id === item.id);
        const cartItem = cart.find(o => o.item_id === item.id);
        
        const oldQty = originalItem ? originalItem.quantity : 0;
        const newQty = cartItem ? cartItem.quantity : 0;
        const delta = newQty - oldQty;
        
        if (delta !== 0 && item.stock_quantity !== undefined) {
          const newStock = item.stock_quantity - delta;
          await db.menu.update(item.id, { stock_quantity: Math.max(0, newStock) });
        }
      }

      await db.sessions.update(session.id, { orders: cart });
      onAdd();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price_at_order * item.quantity), 0);

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b border-border bg-muted/20">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-400" />
            Add Food & Drinks
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Menu Items */}
          <div className="flex-1 overflow-y-auto p-6 border-r border-border min-h-[300px]">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Menu Items</h3>
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => {
                const available = getAvailableStock(item);
                const isOutOfStock = available <= 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    disabled={loading || isOutOfStock}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-black/20 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-center disabled:opacity-50"
                  >
                    <span className="font-medium text-sm text-foreground line-clamp-1">{item.name}</span>
                    <span className="text-indigo-400 font-medium text-xs mt-1">₹ {item.price}</span>
                    <span className={`text-xs mt-1 font-semibold ${isOutOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {isOutOfStock ? 'Out of Stock' : `Stock: ${available}`}
                    </span>
                  </button>
                );
              })}
              {items.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                  No active menu items available.
                </div>
              )}
            </div>
          </div>

          {/* Cart View */}
          <div className="w-full md:w-[280px] bg-muted/10 flex flex-col">
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="text-sm font-medium text-foreground">Current Order</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
              {cart.map(order => (
                <div key={order.item_id} className="flex flex-col gap-2 p-3 bg-background rounded-lg border border-border">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-foreground">{order.name}</span>
                    <span className="text-sm font-bold text-emerald-500">₹{order.price_at_order * order.quantity}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">₹{order.price_at_order} each</span>
                    <div className="flex items-center gap-2 bg-muted rounded-md p-1">
                      <button 
                        onClick={() => updateQuantity(order.item_id, -1)}
                        className="w-6 h-6 flex items-center justify-center bg-background rounded text-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-medium w-4 text-center">{order.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(order.item_id, 1)}
                        className="w-6 h-6 flex items-center justify-center bg-background rounded text-foreground hover:bg-indigo-500 hover:text-white transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8 opacity-50">
                  <ShoppingCart className="w-8 h-8 mb-2" />
                  <span className="text-sm">Cart is empty</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/30 border-t border-border mt-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="text-muted-foreground text-sm">Total</span>
                <span className="text-xl font-bold text-foreground">₹ {cartTotal.toFixed(2)}</span>
              </div>
              <Button 
                onClick={handleSave} 
                disabled={loading || cart.length === 0} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? 'Saving...' : 'Save Order'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
