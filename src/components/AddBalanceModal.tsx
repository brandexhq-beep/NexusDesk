import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db, whatsapp } from '../services/db';
import type { Customer } from '../types';
import { Banknote, QrCode } from 'lucide-react';

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
  const [timePaymentMode, setTimePaymentMode] = useState<'cash' | 'upi'>('cash');

  // State for adding/deducting Cash
  const [cashAmount, setCashAmount] = useState('');
  const [isDeduct, setIsDeduct] = useState(false);
  const [walletPaymentMode, setWalletPaymentMode] = useState<'cash' | 'upi'>('cash');

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
        available_minutes: (customer.available_minutes || 0) + totalMins
      });

      const paid = parseFloat(amountPaidForTime);
      if (paid > 0) {
        const modeLabel = timePaymentMode === 'upi' ? 'UPI' : 'Cash';
        await db.transactions.add({
          customer_id: customer.id,
          type: 'session_charge', 
          amount: paid,
          points: Math.floor(paid / 10),
          note: `Purchased ${totalMins} mins (${modeLabel}: ₹${paid.toFixed(2)})`
        });
        await db.customers.update(customer.id, {
          loyalty_points: (customer.loyalty_points || 0) + Math.floor(paid / 10)
        });

        // Send Invoice for Time Purchase
        if (customer.phone) {
          try {
            await whatsapp.sendInvoice({ 
              phone: customer.phone, 
              message: `Hi ${customer.name}, your account has been credited with ${totalMins} minutes. (Paid: ₹${paid} via ${modeLabel})` 
            });
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
      const newBalance = (customer.wallet_balance || 0) + numAmount;

      await db.customers.update(customer.id, {
        wallet_balance: Math.max(0, newBalance)
      });

      const modeLabel = walletPaymentMode === 'upi' ? 'UPI' : 'Cash';
      const noteText = isDeduct 
        ? `Manual Deduction: ₹${amt.toFixed(2)}` 
        : `Wallet Top-up (${modeLabel}: ₹${amt.toFixed(2)})`;

      await db.transactions.add({
        customer_id: customer.id,
        type: isDeduct ? 'wallet_deduction' : 'wallet_topup',
        amount: isDeduct ? -amt : amt,
        points: isDeduct ? 0 : Math.floor(amt / 10),
        note: noteText
      });

      if (!isDeduct) {
        await db.customers.update(customer.id, {
          loyalty_points: (customer.loyalty_points || 0) + Math.floor(amt / 10)
        });

        // Send Invoice for Wallet Top-up
        if (customer.phone) {
          try {
            await whatsapp.sendInvoice({ 
              phone: customer.phone, 
              message: `Hi ${customer.name}, your wallet has been credited with ₹${amt.toFixed(2)} via ${modeLabel}. Total balance: ₹${Math.max(0, newBalance).toFixed(2)}.` 
            });
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
    setTimePaymentMode('cash');
    setWalletPaymentMode('cash');
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
        
        <Tabs defaultValue="time" className="mt-2">
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <TabsTrigger value="time">Add Time</TabsTrigger>
            <TabsTrigger value="cash">Add / Deduct Wallet</TabsTrigger>
          </TabsList>
          
          <TabsContent value="time" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Hours</Label>
                <Input 
                  type="number" min="0" 
                  value={hours} onChange={(e) => setHours(e.target.value)} 
                  className="bg-background border-border h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Minutes</Label>
                <Input 
                  type="number" min="0" max="59" 
                  value={minutes} onChange={(e) => setMinutes(e.target.value)} 
                  className="bg-background border-border h-8 text-xs"
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Amount Paid (Optional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground text-xs">₹</span>
                <Input 
                  type="number" min="0" step="0.01" 
                  placeholder="0.00"
                  value={amountPaidForTime} onChange={(e) => setAmountPaidForTime(e.target.value)} 
                  className="bg-background border-border pl-7 h-8 text-xs"
                />
              </div>
              {parseFloat(amountPaidForTime) > 0 && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTimePaymentMode('cash')}
                    className={`flex-1 py-1.5 px-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      timePaymentMode === 'cash' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-background border-border text-muted-foreground'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimePaymentMode('upi')}
                    className={`flex-1 py-1.5 px-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      timePaymentMode === 'upi' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-background border-border text-muted-foreground'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" /> UPI / Online
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleAddTime} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2 h-9 text-xs">
              {loading ? 'Adding...' : 'Add Time to Customer'}
            </Button>
          </TabsContent>

          <TabsContent value="cash" className="space-y-3 mt-3">
            <div className="flex items-center justify-between border border-border p-2.5 rounded-md bg-background/50">
              <div className="space-y-0.5">
                <Label className="text-xs">{isDeduct ? 'Deduct Balance' : 'Add Balance'}</Label>
                <p className="text-[10px] text-muted-foreground">Toggle to correct an existing balance.</p>
              </div>
              <input 
                type="checkbox"
                checked={isDeduct}
                onChange={(e) => setIsDeduct(e.target.checked)}
                className="w-4 h-4 accent-red-500 bg-background border-border rounded cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Amount (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-muted-foreground text-xs">₹</span>
                <Input 
                  type="number" min="0" step="0.01" 
                  placeholder="0.00"
                  value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} 
                  className="bg-background border-border pl-7 h-8 text-xs"
                />
              </div>

              {!isDeduct && parseFloat(cashAmount) > 0 && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setWalletPaymentMode('cash')}
                    className={`flex-1 py-1.5 px-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      walletPaymentMode === 'cash' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-background border-border text-muted-foreground'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletPaymentMode('upi')}
                    className={`flex-1 py-1.5 px-2 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      walletPaymentMode === 'upi' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-background border-border text-muted-foreground'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" /> UPI / Online
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleSave} disabled={loading} className={`w-full text-white mt-3 h-9 text-xs ${isDeduct ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {loading ? 'Processing...' : isDeduct ? 'Deduct Balance' : 'Add Balance to Wallet'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
