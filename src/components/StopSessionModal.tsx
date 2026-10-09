import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, whatsapp } from '../services/db';
import type { Station, Session, Customer, PricingRule, AppSettings, PaymentMode } from '../types';
import { calculateDynamicCost } from '../lib/pricing';
import { generateInvoiceText } from '../lib/invoice';
import { Banknote, QrCode, Wallet, Split, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface StopSessionModalProps {
  station: Station | null;
  session: Session | null;
  rules: PricingRule[];
  onClose: () => void;
  onStop: () => void;
}

export function StopSessionModal({ station, session, rules, onClose, onStop }: StopSessionModalProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [splitCash, setSplitCash] = useState<string>('0');
  const [splitUpi, setSplitUpi] = useState<string>('0');
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState({ gameMinutes: 0, gameTime: 0, food: 0, subtotal: 0, discount: 0, total: 0, specialDiscountAmt: 0, customDiscountAmt: 0 });
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [conversionRate, setConversionRate] = useState<number>(10);
  const [minutesUsed, setMinutesUsed] = useState<number>(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sendInvoice, setSendInvoice] = useState(false);
  const [manualGameCost, setManualGameCost] = useState<string>('');
  const [isManualOverride, setIsManualOverride] = useState(false);

  useEffect(() => {
    db.settings.get().then(s => {
      setConversionRate(s.loyalty_conversion_rate || 10);
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
      let calculatedGameCost = 0;
      let usedMins = 0;

      if (session.combo_id) {
        calculatedGameCost = session.base_amount || 0;
      } else {
        const customerFreeMinutes = currentCust ? (currentCust.available_minutes || 0) : 0;
        const prepaidMinutes = session.prepaid_duration_mins || 0;
        const totalFreeMinutes = customerFreeMinutes + prepaidMinutes;
        
        const res = calculateDynamicCost(Number(session.start_time), now, station, rules, totalFreeMinutes, session.num_players, session.pricing_snapshot);
        calculatedGameCost = (session.base_amount || 0) + res.cost;
        usedMins = Math.max(0, Math.min(customerFreeMinutes, res.minutesUsed - prepaidMinutes));
      }

      const extMins = session.extended_minutes || 0;
      if (extMins > 0) {
        calculatedGameCost += (extMins / 60) * station.hourly_rate;
      }

      setMinutesUsed(usedMins);
      const foodCost = session.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0);
      const totalMins = Math.ceil((now - Number(session.start_time)) / 60000);

      const effectiveGameCost = isManualOverride && manualGameCost !== '' ? Number(manualGameCost) || 0 : calculatedGameCost;
      if (!isManualOverride) {
        setManualGameCost(calculatedGameCost.toFixed(2));
      }

      setBill(prev => ({
        ...prev,
        gameMinutes: totalMins,
        gameTime: effectiveGameCost,
        food: foodCost,
        subtotal: effectiveGameCost + foodCost,
        total: Math.max(0, effectiveGameCost + foodCost - prev.discount)
      }));
    };

    init();
  }, [session, station, rules, isManualOverride, manualGameCost]);

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
    const finalTotal = Math.max(0, bill.subtotal - totalDiscounts);
    
    setBill(prev => ({
      ...prev,
      discount: totalDiscounts,
      specialDiscountAmt,
      customDiscountAmt,
      total: finalTotal
    }));

    // Auto update split amounts if in mixed mode
    if (paymentMode === 'mixed') {
      const currentCash = parseFloat(splitCash) || 0;
      if (currentCash <= finalTotal) {
        setSplitUpi((finalTotal - currentCash).toFixed(2));
      } else {
        setSplitCash(finalTotal.toFixed(2));
        setSplitUpi('0.00');
      }
    }
  }, [pointsToRedeem, conversionRate, bill.subtotal, customDiscount, settings]);

  const handlePaymentModeChange = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === 'mixed') {
      const half = (bill.total / 2).toFixed(2);
      const otherHalf = (bill.total - parseFloat(half)).toFixed(2);
      setSplitCash(half);
      setSplitUpi(otherHalf);
    }
  };

  const handleSplitCashChange = (valStr: string) => {
    setSplitCash(valStr);
    const val = parseFloat(valStr) || 0;
    const rem = Math.max(0, bill.total - val);
    setSplitUpi(rem.toFixed(2));
  };

  const handleSplitUpiChange = (valStr: string) => {
    setSplitUpi(valStr);
    const val = parseFloat(valStr) || 0;
    const rem = Math.max(0, bill.total - val);
    setSplitCash(rem.toFixed(2));
  };

  const handleCheckout = async () => {
    if (!session || !station) return;
    setLoading(true);
    try {
      let finalCash = 0;
      let finalUpi = 0;
      let finalWallet = 0;

      if (paymentMode === 'cash') {
        finalCash = bill.total;
      } else if (paymentMode === 'upi') {
        finalUpi = bill.total;
      } else if (paymentMode === 'wallet') {
        if (customer && customer.wallet_balance >= bill.total) {
          finalWallet = bill.total;
        } else {
          toast.error('Customer does not have enough wallet balance for full payment. Please use Split or Cash/UPI.');
          setLoading(false);
          return;
        }
      } else if (paymentMode === 'mixed') {
        finalCash = Math.max(0, parseFloat(splitCash) || 0);
        finalUpi = Math.max(0, parseFloat(splitUpi) || 0);
        const splitSum = Math.round((finalCash + finalUpi) * 100) / 100;
        const targetTotal = Math.round(bill.total * 100) / 100;

        if (Math.abs(splitSum - targetTotal) > 0.05) {
          toast.error(`Split amounts (Cash ₹${finalCash} + UPI ₹${finalUpi} = ₹${splitSum}) do not match total ₹${bill.total.toFixed(2)}`);
          setLoading(false);
          return;
        }
      }

      // 1. Update session
      await db.sessions.update(session.id, {
        status: 'completed',
        end_time: Date.now(),
        total_amount: bill.total,
        base_amount: bill.gameTime,
        food_amount: bill.food,
        payment_mode: paymentMode,
        cash_amount: finalCash,
        upi_amount: finalUpi,
        wallet_amount: finalWallet,
        split_breakdown: {
          cash: finalCash,
          upi: finalUpi,
          wallet: finalWallet
        }
      });

      // 2. Update station
      await db.stations.update(station.id, { status: 'free' });

      // 3. Handle Customer tab/wallet/loyalty
      if (customer) {
        let newWalletBalance = customer.wallet_balance || 0;
        let transactionNote = `Session at ${station.name} (${paymentMode.toUpperCase()})`;

        if (paymentMode === 'wallet') {
          newWalletBalance = Math.max(0, customer.wallet_balance - bill.total);
          transactionNote = `Session at ${station.name} (Paid via Wallet ₹${bill.total.toFixed(2)})`;
        } else if (paymentMode === 'mixed') {
          transactionNote = `Session at ${station.name} (Split: ₹${finalCash.toFixed(2)} Cash + ₹${finalUpi.toFixed(2)} UPI)`;
        } else if (paymentMode === 'cash') {
          transactionNote = `Session at ${station.name} (Paid via Cash ₹${bill.total.toFixed(2)})`;
        } else if (paymentMode === 'upi') {
          transactionNote = `Session at ${station.name} (Paid via UPI ₹${bill.total.toFixed(2)})`;
        }
        
        await db.transactions.add({
          customer_id: customer.id,
          type: 'session_charge',
          amount: bill.total,
          points: Math.floor(bill.total / (conversionRate || 10)), 
          note: transactionNote,
          session_id: session.id
        });

        // Deduct redeemed loyalty points and calculate new points
        let newPoints = (customer.loyalty_points || 0) - pointsToRedeem;
        if (settings?.loyalty_enabled !== false) {
          newPoints += Math.floor(bill.total / (conversionRate || 10));
        }

        const newAvailableMinutes = Math.max(0, (customer.available_minutes || 0) - minutesUsed);

        await db.customers.update(customer.id, {
          wallet_balance: newWalletBalance,
          loyalty_points: Math.max(0, newPoints),
          available_minutes: newAvailableMinutes,
          loyalty_points_updated_at: Date.now()
        });
      }

      // 4. Send Invoice via WhatsApp if requested
      if (sendInvoice && customer?.phone && settings) {
        try {
          const invoiceText = generateInvoiceText(
            {
              ...session,
              total_amount: bill.total,
              base_amount: bill.gameTime,
              food_amount: bill.food,
              payment_mode: paymentMode,
              cash_amount: finalCash,
              upi_amount: finalUpi,
              wallet_amount: finalWallet,
            },
            station,
            settings,
            {
              customerName: customer.name,
              customerPhone: customer.phone,
              pointsEarned: Math.floor(bill.total / (conversionRate || 10)),
              pointsRedeemed: pointsToRedeem,
              loyaltyDiscount: pointsToRedeem / conversionRate,
              specialDiscount: bill.specialDiscountAmt,
              customDiscount: bill.customDiscountAmt,
              gameMinutes: bill.gameMinutes
            }
          );
          
          await whatsapp.sendInvoice({
            phone: customer.phone,
            message: invoiceText
          });
          toast.success('Invoice sent via WhatsApp!');
        } catch (e) {
          console.error("Failed to send WhatsApp invoice:", e);
          toast.error('Could not send WhatsApp invoice, checkout completed.');
        }
      }

      toast.success('Session completed successfully!');
      onStop();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Failed to complete checkout');
    } finally {
      setLoading(false);
    }
  };

  const startDate = session?.start_time ? new Date(session.start_time) : new Date();
  const endDate = new Date();
  const currencyStr = settings?.currency_symbol || '₹';

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-4xl p-0 overflow-hidden flex flex-col md:flex-row h-[92vh] max-h-[750px]">
        {/* Left Side: Checkout Form */}
        <div className="flex-1 flex flex-col h-full border-r border-border overflow-y-auto">
          <DialogHeader className="p-4 border-b border-border bg-black/20">
            <DialogTitle className="flex justify-between items-center text-lg">
              <span>Checkout - {station?.name}</span>
              <span className="text-xs font-mono font-normal bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                {bill.gameMinutes} mins
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4 flex-1">
            {/* Bill Breakdown Summary Cards */}
            <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-lg border border-border/50">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Gaming Time:</span>
                  <button 
                    type="button" 
                    onClick={() => setIsManualOverride(!isManualOverride)}
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    {isManualOverride ? 'Auto' : 'Edit'}
                  </button>
                </div>
                {isManualOverride ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">{currencyStr}</span>
                    <Input 
                      type="number" 
                      value={manualGameCost} 
                      onChange={(e) => setManualGameCost(e.target.value)}
                      className="h-7 text-xs bg-background"
                      placeholder="0.00"
                    />
                  </div>
                ) : (
                  <div className="font-semibold text-foreground text-sm mt-0.5">{currencyStr} {bill.gameTime.toFixed(2)}</div>
                )}
              </div>

              <div>
                <span className="text-xs text-muted-foreground">Food & Drinks:</span>
                <div className="font-semibold text-foreground text-sm mt-0.5">{currencyStr} {bill.food.toFixed(2)}</div>
              </div>

              {bill.discount > 0 && (
                <div className="col-span-2 flex justify-between items-center text-xs text-emerald-400 border-t border-border/30 pt-1.5 mt-1">
                  <span>Total Discounts:</span>
                  <span>- {currencyStr} {bill.discount.toFixed(2)}</span>
                </div>
              )}

              <div className="col-span-2 flex justify-between items-center text-base font-bold text-foreground border-t border-border/50 pt-2">
                <span>Final Payable:</span>
                <span className="text-emerald-400 text-lg">{currencyStr} {bill.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Loyalty Points Redemption */}
            {customer && customer.loyalty_points > 0 && (
              <div className="space-y-2 bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <Label htmlFor="loyalty" className="text-xs font-semibold text-indigo-200 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Redeem Loyalty Points
                  </Label>
                  <span className="text-xs font-bold text-amber-400">{customer.loyalty_points} Pts Available</span>
                </div>
                <div className="flex gap-2">
                  <Input 
                    id="loyalty" 
                    type="number" 
                    min="0" 
                    max={customer.loyalty_points} 
                    value={pointsToRedeem} 
                    onChange={(e) => {
                      const maxAllowed = Math.min(customer.loyalty_points, Math.ceil(bill.subtotal * conversionRate));
                      const val = Math.min(Number(e.target.value) || 0, maxAllowed);
                      setPointsToRedeem(val);
                    }}
                    className="border-white/10 bg-black/40 h-8 text-xs"
                  />
                  <Button 
                    size="sm"
                    variant="secondary" 
                    className="bg-white/10 hover:bg-white/20 border border-white/5 h-8 text-xs" 
                    onClick={() => {
                      const maxRedeemableForBill = Math.ceil(bill.subtotal * conversionRate);
                      setPointsToRedeem(Math.min(customer.loyalty_points, maxRedeemableForBill));
                    }}
                  >
                    Max
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{conversionRate} Points = {currencyStr}1 Discount</p>
              </div>
            )}

            {/* Custom Discount for Regulars */}
            {customer && (
              <div className="space-y-1.5">
                <Label htmlFor="customDiscount" className="text-xs font-semibold text-foreground">Custom Discount for Regulars</Label>
                <Select value={customDiscount.toString()} onValueChange={(v) => setCustomDiscount(Number(v))}>
                  <SelectTrigger id="customDiscount" className="border-border bg-background h-8 text-xs">
                    <SelectValue placeholder="No Discount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None (0%)</SelectItem>
                    <SelectItem value="5">5% Off</SelectItem>
                    <SelectItem value="10">10% Off</SelectItem>
                    <SelectItem value="15">15% Off</SelectItem>
                    <SelectItem value="20">20% Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Payment Method Selector with Cash vs UPI distinction */}
            <div className="space-y-2 pt-1 border-t border-border">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Select Payment Mode</span>
                <span className="text-[11px] font-normal text-indigo-400 capitalize">Mode: {paymentMode}</span>
              </Label>
              
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {/* Cash */}
                <button
                  type="button"
                  onClick={() => handlePaymentModeChange('cash')}
                  className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMode === 'cash' 
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20' 
                      : 'bg-background hover:bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <Banknote className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-semibold">Cash</span>
                </button>

                {/* UPI */}
                <button
                  type="button"
                  onClick={() => handlePaymentModeChange('upi')}
                  className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMode === 'upi' 
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20' 
                      : 'bg-background hover:bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <QrCode className="w-5 h-5 text-indigo-400" />
                  <span className="text-xs font-semibold">UPI / Online</span>
                </button>

                {/* Wallet */}
                <button
                  type="button"
                  disabled={!customer || (customer.wallet_balance || 0) < bill.total}
                  onClick={() => handlePaymentModeChange('wallet')}
                  className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMode === 'wallet' 
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 shadow-sm shadow-purple-500/20' 
                      : (!customer || (customer.wallet_balance || 0) < bill.total)
                        ? 'opacity-40 cursor-not-allowed bg-background border-border text-muted-foreground'
                        : 'bg-background hover:bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <Wallet className="w-5 h-5 text-purple-400" />
                  <span className="text-xs font-semibold">Wallet</span>
                  <span className="text-[9px] text-muted-foreground">Bal: {currencyStr}{customer?.wallet_balance || 0}</span>
                </button>

                {/* Split Cash + UPI */}
                <button
                  type="button"
                  onClick={() => handlePaymentModeChange('mixed')}
                  className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMode === 'mixed' 
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/20' 
                      : 'bg-background hover:bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <Split className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-semibold">Split (Cash+UPI)</span>
                </button>
              </div>

              {/* Split Details Input Box */}
              {paymentMode === 'mixed' && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3 space-y-3 mt-2 animate-in fade-in duration-200">
                  <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                    <span>Split Cash & UPI Amounts</span>
                    <span className="text-[11px] font-mono text-muted-foreground">Total: {currencyStr}{bill.total.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Banknote className="w-3.5 h-3.5 text-emerald-400" /> Cash Amount ({currencyStr})
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={bill.total}
                        step="1"
                        value={splitCash}
                        onChange={(e) => handleSplitCashChange(e.target.value)}
                        className="h-8 text-xs font-mono bg-background border-emerald-500/30 focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-indigo-400" /> UPI Amount ({currencyStr})
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={bill.total}
                        step="1"
                        value={splitUpi}
                        onChange={(e) => handleSplitUpiChange(e.target.value)}
                        className="h-8 text-xs font-mono bg-background border-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const half = (bill.total / 2).toFixed(2);
                        setSplitCash(half);
                        setSplitUpi((bill.total - parseFloat(half)).toFixed(2));
                      }}
                      className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 text-muted-foreground"
                    >
                      50% Cash / 50% UPI
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSplitCash('100');
                        setSplitUpi(Math.max(0, bill.total - 100).toFixed(2));
                      }}
                      className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 text-muted-foreground"
                    >
                      {currencyStr}100 Cash + Remainder UPI
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp Invoice Toggle */}
            {customer && customer.phone && (
              <div className="flex items-center space-x-2.5 pt-2">
                <input 
                  type="checkbox" 
                  id="sendInvoice"
                  checked={sendInvoice} 
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
                />
                <Label htmlFor="sendInvoice" className="cursor-pointer text-xs font-medium text-indigo-200">
                  Send Invoice via WhatsApp now to {customer.phone}
                </Label>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border mt-auto flex gap-3 bg-black/20">
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 border-white/10 hover:bg-white/5">Cancel</Button>
            <Button onClick={handleCheckout} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25">
              {loading ? 'Processing...' : `Complete Checkout (${currencyStr}${bill.total.toFixed(2)})`}
            </Button>
          </div>
        </div>

        {/* Right Side: HTML Receipt Preview */}
        <div className="flex-1 h-full bg-[#f4f4f4] relative hidden md:flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white text-black w-full max-w-sm min-h-[460px] shadow-2xl p-5 font-mono text-xs leading-relaxed" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
            <h2 className="text-center font-bold text-base mb-3">{settings?.cafe_name || 'INVOICE'}</h2>
            
            <div className="text-[11px] mb-3 space-y-0.5 border-b border-gray-200 pb-2">
              <div>Date: {startDate.toLocaleDateString()}</div>
              <div>Time: {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
              <div>Customer: {customer ? customer.name : 'Walk-in'}</div>
              <div>Phone: {customer ? customer.phone : 'N/A'}</div>
              <div>Station: {station?.name}</div>
            </div>

            <table className="w-full text-[11px] mb-3">
              <thead>
                <tr className="border-b border-black text-[10px] uppercase">
                  <th className="text-left font-bold py-1">Item</th>
                  <th className="text-center font-bold py-1 w-10">Qty</th>
                  <th className="text-right font-bold py-1 w-16">Amt</th>
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

            <div className="border-t-2 border-black pt-2 flex justify-between font-bold text-sm">
              <span>Total:</span>
              <span>{currencyStr} {bill.total.toFixed(2)}</span>
            </div>

            <div className="mt-2 text-[10px] bg-gray-100 p-1.5 rounded text-gray-800">
              <span className="font-bold">Payment: </span>
              {paymentMode === 'cash' && `CASH (${currencyStr}${bill.total.toFixed(2)})`}
              {paymentMode === 'upi' && `UPI / ONLINE (${currencyStr}${bill.total.toFixed(2)})`}
              {paymentMode === 'wallet' && `WALLET (${currencyStr}${bill.total.toFixed(2)})`}
              {paymentMode === 'mixed' && `SPLIT: ${currencyStr}${parseFloat(splitCash || '0').toFixed(2)} Cash + ${currencyStr}${parseFloat(splitUpi || '0').toFixed(2)} UPI`}
            </div>

            {settings?.loyalty_enabled !== false && (
              <div className="mt-4 text-center text-xs font-bold text-indigo-900">
                + {Math.floor(bill.total / (conversionRate || 10))} Loyalty Pts!
                {settings?.loyalty_expiry_enabled && (
                  <div className="text-[10px] font-normal mt-0.5 text-gray-500 italic">
                    (Expires in {settings.loyalty_expiry_days || 30} days)
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-3 text-center text-[10px] italic text-gray-500 border-t border-gray-100 pt-2">
              {settings?.invoice_footer_msg || 'Thank you for gaming with us!'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
