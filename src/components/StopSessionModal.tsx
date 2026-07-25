import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { Station, Session, Customer, PricingRule, AppSettings } from '../types';
import { calculateDynamicCost } from '../lib/pricing';
import { generateInvoicePDF } from '../lib/invoice';

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
  const [bill, setBill] = useState({ gameTime: 0, food: 0, subtotal: 0, discount: 0, total: 0, specialDiscountAmt: 0, customDiscountAmt: 0 });
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [conversionRate, setConversionRate] = useState<number>(10);
  const [minutesUsed, setMinutesUsed] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sendInvoice, setSendInvoice] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    db.settings.get().then(s => {
      setConversionRate(s.loyalty_conversion_rate);
      setSettings(s);
    });
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
          setSendInvoice(!!found.phone);
        }
      } else {
        setCustomer(null);
        setSendInvoice(false);
      }

      // Calculate final bill with resolved customer data
      const now = Date.now();
      let gameTimeCost = 0;
      let usedMins = 0;

      if (session.combo_id) {
        gameTimeCost = session.base_amount || 0;
      } else {
        const customerFreeMinutes = currentCust ? currentCust.available_minutes : 0;
        const prepaidMinutes = session.prepaid_duration_mins || 0;
        const totalFreeMinutes = customerFreeMinutes + prepaidMinutes;
        
        const res = calculateDynamicCost(Number(session.start_time), now, station, rules, totalFreeMinutes);
        gameTimeCost = (session.base_amount || 0) + res.cost;
        usedMins = Math.max(0, res.minutesUsed - prepaidMinutes);
      }

      const extMins = session.extended_minutes || 0;
      if (extMins > 0) {
        gameTimeCost += (extMins / 60) * station.hourly_rate;
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
    const ptsDiscount = pointsToRedeem / conversionRate;
    
    let spcDiscountPct = 0;
    if (settings && settings.special_discount_days) {
      const today = new Date().getDate();
      if (settings.special_discount_days.includes(today)) {
        spcDiscountPct = settings.special_discount_percent || 0;
      }
    }
    
    const specialDiscountAmt = (bill.subtotal * spcDiscountPct) / 100;
    const customDiscountAmt = (bill.subtotal * customDiscount) / 100;
    
    const totalDiscounts = ptsDiscount + specialDiscountAmt + customDiscountAmt;
    
    setBill(prev => ({
      ...prev,
      discount: ptsDiscount,
      specialDiscountAmt,
      customDiscountAmt,
      total: Math.max(0, prev.subtotal - totalDiscounts)
    }));
  }, [pointsToRedeem, conversionRate, bill.subtotal, customDiscount, settings]);

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
          note: `Session at ${station.name}`,
          session_id: session.id
        });

        if (pointsToRedeem > 0) {
          await db.transactions.add({
            customer_id: customer.id,
            type: 'points_redeemed',
            amount: 0,
            points: -pointsToRedeem,
            note: `Redeemed ${pointsToRedeem} points`,
            session_id: session.id
          });
        }

        const newLoyaltyPoints = customer.loyalty_points + Math.floor(bill.total / 10) - pointsToRedeem;
        await db.customers.update(customer.id, { 
          wallet_balance: Math.max(0, newWalletBalance),
          amount_owed: newAmountOwed,
          loyalty_points: newLoyaltyPoints,
          available_minutes: Math.max(0, customer.available_minutes - minutesUsed) 
        });

        if (customer.phone && sendInvoice && settings) {
          try {
            const completedSession = { 
              ...session, 
              status: 'completed' as const, 
              end_time: Date.now(), 
              total_amount: bill.total, 
              base_amount: bill.gameTime,
              payment_mode: paymentMode as any 
            };
            
            const invoiceData = {
              customerName: customer.name,
              customerPhone: customer.phone,
              pointsEarned: Math.floor(bill.total / 10),
              pointsRedeemed: pointsToRedeem,
              loyaltyDiscount: bill.discount,
              specialDiscount: bill.specialDiscountAmt || 0,
              customDiscount: bill.customDiscountAmt || 0
            };
            
            const pdfBlob = await generateInvoicePDF(completedSession, station, settings, invoiceData);
            
            const reader = new FileReader();
            reader.readAsDataURL(pdfBlob);
            reader.onloadend = () => {
              const base64data = (reader.result as string).split(',')[1];
              const googleReviewLink = settings.google_review_url || "https://g.page/r/YOUR_UNIQUE_LINK/review";
              const cafeName = settings.cafe_name || "us";
              const message = `Hi ${customer.name},\n\nThank you for choosing ${cafeName}! Attached is your invoice for today's session.\n\nIf you have a moment, please leave us a review on Google using the link below:\n${googleReviewLink}\n\nThank you again, and we look forward to seeing you soon!`;

              fetch('http://localhost:3001/send-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phone: customer.phone,
                  message,
                  pdfBase64: base64data,
                  pdfName: `Invoice_${customer.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`
                })
              }).catch(console.error); // Fire and forget so we don't block closing
            };
          } catch (pdfErr) {
            console.error('Failed to generate/send immediate invoice:', pdfErr);
          }
        }

        // Queue a review request for 30 minutes from now if the customer has a phone number
        if (customer.phone) {
          await db.reviewRequests.add({
            customer_id: customer.id,
            session_id: session.id,
            scheduled_for: Date.now() + (settings ? (settings.review_delay_mins || 30) : 30) * 60 * 1000,
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

  const handlePreviewPDF = async () => {
    if (!settings || !station || !session) return;
    const completedSession = { 
      ...session, 
      status: 'completed' as const, 
      end_time: Date.now(), 
      total_amount: bill.total, 
      base_amount: bill.gameTime, // Fix: pass calculated dynamic time cost to PDF
      payment_mode: paymentMode as any 
    };
    const invoiceData = {
      customerName: customer ? customer.name : 'Walk-in',
      customerPhone: customer ? customer.phone : '',
      pointsEarned: Math.floor(bill.total / 10),
      pointsRedeemed: pointsToRedeem,
      loyaltyDiscount: bill.discount,
      specialDiscount: bill.specialDiscountAmt || 0,
      customDiscount: bill.customDiscountAmt || 0
    };
    try {
      const pdfBlob = await generateInvoicePDF(completedSession, station, settings, invoiceData);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setPdfPreviewUrl(pdfUrl);
    } catch (e) {
      console.error(e);
      alert('Failed to generate PDF preview.');
    }
  };

  if (pdfPreviewUrl) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && setPdfPreviewUrl(null)}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-sm h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bill Preview (POS Format)</DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full bg-white rounded-md overflow-hidden border border-border">
            <iframe src={pdfPreviewUrl} className="w-full h-full" title="PDF Preview" />
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPdfPreviewUrl(null)} className="w-full">Close Preview</Button>
            <Button onClick={() => {
              const newWindow = window.open();
              if (newWindow) {
                newWindow.document.write(`<iframe width='100%' height='100%' src='${pdfPreviewUrl}' style='border:none'></iframe>`);
                setTimeout(() => newWindow.print(), 500);
              }
            }} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
            {bill.specialDiscountAmt > 0 && (
               <div className="flex justify-between text-emerald-500">
                 <span>Special Day Discount</span>
                 <span>- ₹ {bill.specialDiscountAmt.toFixed(2)}</span>
               </div>
            )}
            {bill.customDiscountAmt > 0 && (
               <div className="flex justify-between text-emerald-500">
                 <span>Custom Discount</span>
                 <span>- ₹ {bill.customDiscountAmt.toFixed(2)}</span>
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

          {customer && (
            <div className="space-y-2">
              <Label htmlFor="customDiscount">Custom Discount for Regulars</Label>
              <Select value={customDiscount.toString()} onValueChange={(v) => setCustomDiscount(Number(v))}>
                <SelectTrigger id="customDiscount" className="border-border">
                  <SelectValue placeholder="No Discount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None (0%)</SelectItem>
                  <SelectItem value="10">10% Off</SelectItem>
                  <SelectItem value="20">20% Off</SelectItem>
                </SelectContent>
              </Select>
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

          {customer && customer.phone && (
            <div className="flex items-center space-x-2 pt-2">
              <input 
                type="checkbox" 
                id="sendInvoice"
                checked={sendInvoice} 
                onChange={(e) => setSendInvoice(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="sendInvoice" className="cursor-pointer">Send Invoice via WhatsApp now</Label>
            </div>
          )}
        </div>

        <DialogFooter className="w-full sm:justify-between items-center">
          <Button variant="ghost" onClick={handlePreviewPDF} className="text-indigo-400">Preview Bill</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading} className="border-border">Cancel</Button>
            <Button onClick={handleCheckout} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Processing...' : 'Complete Checkout'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
