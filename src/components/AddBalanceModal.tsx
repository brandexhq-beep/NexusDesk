import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db, whatsapp } from '../services/db';
import type { Customer } from '../types';

interface AddBalanceModalProps {
  customer: Customer | null;
  onClose: () => void;
  onAdd: () => void;
}

export function AddBalanceModal({ customer, onClose, onAdd }: AddBalanceModalProps) {
  const [loading, setLoading] = useState(false);
  
  // State for adding Time
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [amountPaidForTime, setAmountPaidForTime] = useState('');

  // State for adding/deducting Cash
  const [cashAmount, setCashAmount] = useState('');
  const [isDeduct, setIsDeduct] = useState(false);

  useEffect(() => {
    if (!customer) {
      resetForm();
    }
  }, [customer]);

  const handleAddTime = async () => {
    if (!customer) return;
    const h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    const totalMins = (h * 60) + m;
    if (totalMins <= 0) return;

    setLoading(true);
    try {
      await db.customers.update(customer.id, {
        available_minutes: customer.available_minutes + totalMins
      });

      const paid = parseFloat(amountPaidForTime);
      if (paid > 0) {
        await db.transactions.add({
          customer_id: customer.id,
          type: 'session_charge', 
          amount: paid,
          points: Math.floor(paid / 10),
          note: `Purchased ${totalMins} mins`
        });
        await db.customers.update(customer.id, {
          loyalty_points: customer.loyalty_points + Math.floor(paid / 10)
        });

        // Send Invoice for Time Purchase
        if (customer.phone) {
          try {
            await whatsapp.sendInvoice({ phone: customer.phone, message: `Hi ${customer.name}, your account has been credited with ${totalMins} minutes.` });
          } catch (e) {
            console.error("WhatsApp invoice error:", e);
          }
        }
      }

      onAdd();
      onClose();
      resetForm();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!customer) return;
    const amt = parseFloat(cashAmount) || 0;
    if (amt <= 0) return;

    setLoading(true);
    try {
      const numAmount = isDeduct ? -amt : amt;
      const newBalance = customer.wallet_balance + numAmount;

      await db.customers.update(customer.id, {
        wallet_balance: Math.max(0, newBalance)
      });

      await db.transactions.add({
        customer_id: customer.id,
        type: isDeduct ? 'wallet_deduction' : 'wallet_topup',
        amount: isDeduct ? -amt : amt,
        points: isDeduct ? 0 : Math.floor(amt / 10),
        note: isDeduct ? 'Manual Deduction' : 'Wallet Top-up'
      });

      if (!isDeduct) {
        await db.customers.update(customer.id, {
          loyalty_points: customer.loyalty_points + Math.floor(amt / 10)
        });

        // Send Invoice for Wallet Top-up
        if (customer.phone) {
          try {
            await whatsapp.sendInvoice({ phone: customer.phone, message: `Hi ${customer.name}, your wallet has been credited with ₹${amt}.` });
          } catch (e) {
            console.error("WhatsApp invoice error:", e);
          }
        }
      }

      onAdd();
      onClose();
      resetForm();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setHours('0');
    setMinutes('0');
    setAmountPaidForTime('');
    setCashAmount('');
    setIsDeduct(false);
  };

  return (
    <Dialog open={!!customer} onOpenChange={(open) => {
      if (!open) {
        onClose();
        resetForm();
      }
    }}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Balance: {customer?.name}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="time" className="mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <TabsTrigger value="time">Add Time</TabsTrigger>
            <TabsTrigger value="cash">Add Cash</TabsTrigger>
          </TabsList>
          
          <TabsContent value="time" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input 
                  type="number" min="0" 
                  value={hours} onChange={(e) => setHours(e.target.value)} 
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Minutes</Label>
                <Input 
                  type="number" min="0" max="59" 
                  value={minutes} onChange={(e) => setMinutes(e.target.value)} 
                  className="bg-background border-border"
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t border-border">
              <Label>Amount Paid (Optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                <Input 
                  type="number" min="0" step="0.01" 
                  placeholder="0.00"
                  value={amountPaidForTime} onChange={(e) => setAmountPaidForTime(e.target.value)} 
                  className="bg-background border-border pl-7"
                />
              </div>
            </div>

            <Button onClick={handleAddTime} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
              {loading ? 'Adding...' : 'Add Time'}
            </Button>
          </TabsContent>

          <TabsContent value="cash" className="space-y-4 mt-4">
            <div className="flex items-center justify-between border border-border p-3 rounded-md bg-background/50">
              <div className="space-y-0.5">
                <Label>{isDeduct ? 'Deduct Balance' : 'Add Balance'}</Label>
                <p className="text-[10px] text-muted-foreground">Toggle to remove an incorrect balance.</p>
              </div>
              <input 
                type="checkbox"
                checked={isDeduct}
                onChange={(e) => setIsDeduct(e.target.checked)}
                className="w-4 h-4 accent-red-500 bg-background border-border rounded cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                <Input 
                  type="number" min="0" step="0.01" 
                  placeholder="0.00"
                  value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} 
                  className="bg-background border-border pl-7"
                />
              </div>
            </div>

            <Button onClick={handleSave} disabled={loading} className={`w-full text-white mt-4 ${isDeduct ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {loading ? 'Processing...' : isDeduct ? 'Deduct Balance' : 'Add Balance'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
