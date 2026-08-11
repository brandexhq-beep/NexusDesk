import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, whatsapp } from '../services/db';
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
  const [bill, setBill] = useState({ gameMinutes: 0, gameTime: 0, food: 0, subtotal: 0, discount: 0, total: 0, specialDiscountAmt: 0, customDiscountAmt: 0 });
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [conversionRate, setConversionRate] = useState<number>(10);
  const [minutesUsed, setMinutesUsed] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sendInvoice, setSendInvoice] = useState(false);

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
        
        const res = calculateDynamicCost(Number(session.start_time), now, station, rules, totalFreeMinutes, session.num_players);
        gameTimeCost = (session.base_amount || 0) + res.cost;
        usedMins = Math.max(0, res.minutesUsed - prepaidMinutes);
      }

      const extMins = session.extended_minutes || 0;
      if (extMins > 0) {
        gameTimeCost += (extMins / 60) * station.hourly_rate;
      }

      setMinutesUsed(usedMins);
      const foodCost = session.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0);
      const totalMins = Math.ceil((now - Number(session.start_time)) / 60000);

      setBill(prev => ({
        ...prev,
        gameMinutes: totalMins,
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

        if (paymentMode === 'wallet') {
          if (customer.wallet_balance >= bill.total) {
            newWalletBalance = customer.wallet_balance - bill.total;
          } else {
            newWalletBalance = 0;
            // They shouldn't get debt. The rest is assumed paid in cash.
          }
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
          loyalty_points: newLoyaltyPoints,
          available_minutes: Math.max(0, customer.available_minutes - minutesUsed),
          loyalty_points_updated_at: Date.now(),
          loyalty_reminder_sent: false
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
              customDiscount: bill.customDiscountAmt || 0,
              gameMinutes: bill.gameMinutes
            };
            
            const pdfBlob = await generateInvoicePDF(completedSession, station, settings, invoiceData);
            
            const reader = new FileReader();
            reader.readAsDataURL(pdfBlob);
            reader.onloadend = () => {
              const base64data = (reader.result as string).split(',')[1];
              const googleReviewLink = settings.google_review_url || "https://g.page/r/YOUR_UNIQUE_LINK/review";
              const cafeName = settings.cafe_name || "us";
              const message = `Hi ${customer.name},\n\nThank you for choosing ${cafeName}! Attached is your invoice for today's session.\n\nIf you have a moment, please leave us a review on Google using the link below:\n${googleReviewLink}\n\nThank you again, and we look forward to seeing you soon!`;

              whatsapp.sendInvoice({
                phone: customer.phone,
                message,
                pdfBase64: base64data,
                pdfName: `Invoice_${customer.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`
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

  // HTML Receipt rendering (No PDF on-the-fly)
  const currencyStr = settings?.currency_symbol === '₹' ? 'Rs.' : settings?.currency_symbol || '₹';
  const startDate = session ? new Date(session.start_time) : new Date();
  const endDate = session?.end_time ? new Date(session.end_time) : new Date();

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-5xl p-0 overflow-hidden flex flex-col md:flex-row h-[85vh]">
        
        {/* Left Side: Checkout Form */}
        <div className="w-full md:w-[450px] flex flex-col border-r border-border h-full bg-background">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle>Checkout: {station?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 font-mono text-sm border border-white/5 shadow-inner">
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
              <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold text-xl text-foreground">
                <span>Total Bill</span>
                <span>₹ {bill.total.toFixed(2)}</span>
              </div>
            </div>

            {customer && (
              <div className="space-y-3">
                <Label htmlFor="points" className="text-sm font-semibold text-foreground/90">Redeem Points (Balance: {customer.loyalty_points})</Label>
                <div className="flex gap-2">
                  <Input 
                    id="points" 
                    type="number" 
                    min="0" 
                    max={Math.min(customer.loyalty_points, Math.ceil(bill.subtotal * conversionRate))} 
                    value={pointsToRedeem} 
                    onChange={(e) => {
                      const maxRedeemableForBill = Math.ceil(bill.subtotal * conversionRate);
                      const maxAllowed = Math.min(customer.loyalty_points, maxRedeemableForBill);
                      const val = Math.min(Number(e.target.value) || 0, maxAllowed);
                      setPointsToRedeem(val);
                    }}
                    className="border-white/10 bg-black/40 shadow-inner"
                  />
                  <Button 
                    variant="secondary" 
                    className="bg-white/10 hover:bg-white/20 border border-white/5" 
                    onClick={() => {
                      const maxRedeemableForBill = Math.ceil(bill.subtotal * conversionRate);
                      setPointsToRedeem(Math.min(customer.loyalty_points, maxRedeemableForBill));
                    }}
                  >
                    Max
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/70">{conversionRate} Points = ₹ 1 Discount</p>
              </div>
            )}

            {customer && (
              <div className="space-y-3">
                <Label htmlFor="customDiscount" className="text-sm font-semibold text-foreground/90">Custom Discount for Regulars</Label>
                <Select value={customDiscount.toString()} onValueChange={(v) => setCustomDiscount(Number(v))}>
                  <SelectTrigger id="customDiscount" className="border-white/10 bg-black/40">
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

            <div className="space-y-3">
              <Label htmlFor="payment" className="text-sm font-semibold text-foreground/90">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger id="payment" className="border-white/10 bg-black/40">
                  <SelectValue placeholder="Select Payment Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash / UPI</SelectItem>
                  {customer && <SelectItem value="wallet">Wallet (Bal: ₹{customer.wallet_balance})</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {customer && customer.phone && (
              <div className="flex items-center space-x-3 pt-2 pb-4">
                <input 
                  type="checkbox" 
                  id="sendInvoice"
                  checked={sendInvoice} 
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="w-5 h-5 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500/50"
                />
                <Label htmlFor="sendInvoice" className="cursor-pointer font-medium text-indigo-100">Send Invoice via WhatsApp now</Label>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-border mt-auto flex gap-3 bg-black/20">
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 border-white/10 hover:bg-white/5">Cancel</Button>
            <Button onClick={handleCheckout} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">
              {loading ? 'Processing...' : 'Complete Checkout'}
            </Button>
          </div>
        </div>

        {/* Right Side: HTML Receipt Preview */}
        <div className="flex-1 h-full bg-[#f4f4f4] relative hidden md:flex items-center justify-center p-8 overflow-y-auto">
          <div className="bg-white text-black w-full max-w-sm min-h-[500px] shadow-2xl p-6 font-mono text-sm leading-relaxed" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <h2 className="text-center font-bold text-xl mb-4">{settings?.cafe_name || 'INVOICE'}</h2>
            
            <div className="text-xs mb-4">
              <div>Date: {startDate.toLocaleDateString()}</div>
              <div>Time: {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
              <div>Customer: {customer ? customer.name : 'Walk-in'}</div>
              <div>Phone: {customer ? customer.phone : 'N/A'}</div>
              <div>Station: {station?.name}</div>
            </div>

            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="border-b border-black">
                  <th className="text-left font-bold py-1">Item</th>
                  <th className="text-center font-bold py-1 w-12">Qty</th>
                  <th className="text-right font-bold py-1 w-20">Amt</th>
                </tr>
              </thead>
              <tbody>
                {bill.gameTime > 0 && (
                  <tr>
                    <td className="py-1">Gaming Time ({bill.gameMinutes} mins)</td>
                    <td className="text-center py-1">1</td>
                    <td className="text-right py-1">{currencyStr} {bill.gameTime.toFixed(2)}</td>
                  </tr>
                )}

                {session?.orders.map((o, idx) => (
                  <tr key={idx}>
                    <td className="py-1">{o.name}</td>
                    <td className="text-center py-1">{o.quantity}</td>
                    <td className="text-right py-1">{currencyStr} {(o.price_at_order * o.quantity).toFixed(2)}</td>
                  </tr>
                ))}

                {bill.discount > 0 && (
                  <tr>
                    <td className="py-1 text-gray-600">Loyalty ({pointsToRedeem} pts)</td>
                    <td className="text-center py-1 text-gray-600">1</td>
                    <td className="text-right py-1 text-gray-600">- {currencyStr} {bill.discount.toFixed(2)}</td>
                  </tr>
                )}
                {bill.specialDiscountAmt > 0 && (
                  <tr>
                    <td className="py-1 text-gray-600">Special Discount</td>
                    <td className="text-center py-1 text-gray-600">1</td>
                    <td className="text-right py-1 text-gray-600">- {currencyStr} {bill.specialDiscountAmt.toFixed(2)}</td>
                  </tr>
                )}
                {bill.customDiscountAmt > 0 && (
                  <tr>
                    <td className="py-1 text-gray-600">Custom Discount</td>
                    <td className="text-center py-1 text-gray-600">1</td>
                    <td className="text-right py-1 text-gray-600">- {currencyStr} {bill.customDiscountAmt.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="border-t-2 border-black pt-2 flex justify-between font-bold text-base">
              <span>Total:</span>
              <span>{currencyStr} {bill.total.toFixed(2)}</span>
            </div>

            {settings?.loyalty_enabled !== false && (
              <div className="mt-6 text-center text-xs font-bold">
                + {Math.floor(bill.total / (settings?.loyalty_conversion_rate || 10))} Loyalty Pts!
                {settings?.loyalty_expiry_enabled && (
                  <div className="text-[10px] font-normal mt-1 text-gray-500 italic">
                    (Expires in {settings.loyalty_expiry_days || 30} days)
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-2 text-center text-xs italic text-gray-600">
              {settings?.invoice_footer_msg || 'Thank you!'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
