import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { Station, Session, Customer, PricingRule } from '../types';
import { calculateDynamicCost } from '../lib/pricing';

interface StopSessionModalProps {
  station: Station | null;
  session: Session | null;
  rules: PricingRule[];
  onClose: () => void;
  onStop: () => void;
}

export function StopSessionModal({ station, session, rules, onClose, onStop }: StopSessionModalProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState({ gameTime: 0, food: 0, subtotal: 0, discount: 0, total: 0 });
  const [conversionRate, setConversionRate] = useState<number>(10);
  const [minutesUsed, setMinutesUsed] = useState<number>(0);

  useEffect(() => {
    db.settings.get().then(s => setConversionRate(s.loyalty_conversion_rate));
  }, []);

  useEffect(() => {
    if (!session || !station) {
      setCustomer(null);
      return;
    }

    const init = async () => {
      let currentCust: Customer | null = null;
      if (session.customer_id) {
        const found = await db.customers.getById(session.customer_id);
        if (found) {
          currentCust = found;
          setCustomer(found);
        }
      } else {
        setCustomer(null);
      }

      // Calculate final bill with resolved customer data
      const now = Date.now();
      let gameTimeCost = 0;
      let usedMins = 0;

      if (session.combo_id) {
        gameTimeCost = session.base_amount || 0;
      } else {
        const freeMinutes = currentCust ? currentCust.available_minutes : 0;
        const res = calculateDynamicCost(Number(session.start_time), now, station, rules, freeMinutes);
        gameTimeCost = res.cost;
        usedMins = res.minutesUsed;
      }

      setMinutesUsed(usedMins);
      const foodCost = session.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0);

      setBill(prev => ({
        ...prev,
        gameTime: gameTimeCost,
        food: foodCost,
        subtotal: gameTimeCost + foodCost,
        total: gameTimeCost + foodCost - prev.discount
      }));
    };

    init();
  }, [session, station, rules]);

  useEffect(() => {
    const discount = pointsToRedeem / conversionRate;
    setBill(prev => ({
      ...prev,
      discount,
      total: Math.max(0, prev.subtotal - discount)
    }));
  }, [pointsToRedeem, conversionRate]);

  const handleCheckout = async () => {
    if (!session || !station) return;
    setLoading(true);
    try {
      // 1. Update session
      await db.sessions.update(session.id, {
        status: 'completed',
        end_time: Date.now(),
        total_amount: bill.total,
        payment_mode: paymentMode as any
      });

      // 2. Update station
      await db.stations.update(station.id, { status: 'free' });

      // 3. Handle Customer tab/wallet
      if (customer) {
        let newWalletBalance = customer.wallet_balance;
        let newAmountOwed = customer.amount_owed;

        if (paymentMode === 'wallet') {
          if (customer.wallet_balance >= bill.total) {
            newWalletBalance = customer.wallet_balance - bill.total;
          } else {
            // Partial payment: wallet balance used up, deficit added to amount_owed (Tab)
            const deficit = bill.total - customer.wallet_balance;
            newWalletBalance = 0;
            newAmountOwed = customer.amount_owed + deficit;
          }
        } else if (paymentMode === 'tab') {
          newAmountOwed = customer.amount_owed + bill.total;
        }
        
        await db.transactions.add({
          customer_id: customer.id,
          type: 'session_charge',
          amount: bill.total,
          points: Math.floor(bill.total / 10), 
          note: `Session at ${station.name}`
        });

        if (pointsToRedeem > 0) {
          await db.transactions.add({
            customer_id: customer.id,
            type: 'points_redeemed',
            amount: 0,
            points: -pointsToRedeem,
            note: `Redeemed ${pointsToRedeem} points`
          });
        }

        // Add points and deduct redeemed
        const newLoyaltyPoints = customer.loyalty_points + Math.floor(bill.total / 10) - pointsToRedeem;
        await db.customers.update(customer.id, { 
          wallet_balance: Math.max(0, newWalletBalance),
          amount_owed: newAmountOwed,
          loyalty_points: newLoyaltyPoints,
          available_minutes: Math.max(0, customer.available_minutes - minutesUsed) 
        });

        // Queue a review request for 30 minutes from now if the customer has a phone number
        if (customer.phone) {
          await db.reviewRequests.add({
            customer_id: customer.id,
            session_id: session.id,
            scheduled_for: Date.now() + 30 * 60 * 1000 // 30 minutes
          });
        }
      }

      onStop();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Checkout: {station?.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gaming Time</span>
              <span>₹ {bill.gameTime.toFixed(2)}</span>
            </div>
            {minutesUsed > 0 && (
              <div className="flex justify-between text-indigo-400">
                <span>Time Credit Applied</span>
                <span>- {minutesUsed} mins</span>
              </div>
            )}
            {session?.orders.map((o, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{o.quantity}x {o.name}</span>
                <span>₹ {(o.price_at_order * o.quantity).toFixed(2)}</span>
              </div>
            ))}
            {pointsToRedeem > 0 && (
               <div className="flex justify-between text-emerald-500">
                 <span>Points Discount</span>
                 <span>- ₹ {bill.discount.toFixed(2)}</span>
               </div>
            )}
            <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold text-lg text-foreground">
              <span>Total Bill</span>
              <span>₹ {bill.total.toFixed(2)}</span>
            </div>
          </div>

          {customer && (
            <div className="space-y-2">
              <Label htmlFor="points">Redeem Points (Balance: {customer.loyalty_points})</Label>
              <div className="flex gap-2">
                <Input 
                  id="points" 
                  type="number" 
                  min="0" 
                  max={customer.loyalty_points} 
                  value={pointsToRedeem} 
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value) || 0, customer.loyalty_points);
                    setPointsToRedeem(val);
                  }}
                  className="border-border bg-background"
                />
                <Button variant="secondary" onClick={() => setPointsToRedeem(customer.loyalty_points)}>Max</Button>
              </div>
              <p className="text-xs text-muted-foreground">{conversionRate} Points = ₹ 1 Discount</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="payment">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger id="payment" className="border-border">
                <SelectValue placeholder="Select Payment Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash / UPI</SelectItem>
                {customer && <SelectItem value="wallet">Wallet (Bal: ₹{customer.wallet_balance})</SelectItem>}
                {customer && <SelectItem value="tab">Add to Tab (Owed: ₹{customer.amount_owed})</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} className="border-border">Cancel</Button>
          <Button onClick={handleCheckout} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {loading ? 'Processing...' : 'Complete Checkout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
