import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Session, PaymentMode, Station, Customer } from '../types';
import { Banknote, QrCode, Split, CreditCard, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface EditPaymentModalProps {
  session: Session | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EditPaymentModal({ session, open, onClose, onUpdated }: EditPaymentModalProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUpi, setSplitUpi] = useState<string>('');
  const [stationName, setStationName] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const totalAmount = session ? (session.total_amount || session.base_amount || 0) : 0;

  useEffect(() => {
    if (!session || !open) return;

    // Initialize mode and amounts
    const currentMode = session.payment_mode || 'cash';
    setPaymentMode(currentMode);

    if (currentMode === 'mixed') {
      const c = session.cash_amount ?? (session.split_breakdown?.cash ?? 0);
      const u = session.upi_amount ?? (session.split_breakdown?.upi ?? 0);
      setSplitCash(c > 0 ? c.toString() : '');
      setSplitUpi(u > 0 ? u.toString() : '');
    } else if (currentMode === 'cash') {
      setSplitCash(totalAmount.toString());
      setSplitUpi('0');
    } else if (currentMode === 'upi') {
      setSplitCash('0');
      setSplitUpi(totalAmount.toString());
    } else {
      setSplitCash(Math.floor(totalAmount / 2).toString());
      setSplitUpi((totalAmount - Math.floor(totalAmount / 2)).toString());
    }

    // Resolve station and customer names
    db.stations.getAll().then((stations: Station[]) => {
      const st = stations.find(s => s.id === session.station_id);
      setStationName(st ? st.name : `Station ${session.station_id}`);
    }).catch(() => {});

    if (session.customer_id) {
      db.customers.getById(session.customer_id).then((cust: Customer | undefined) => {
        setCustomerName(cust ? `${cust.name} (${cust.phone || 'No phone'})` : 'Member Customer');
      }).catch(() => setCustomerName('Member Customer'));
    } else {
      setCustomerName('Walk-in Customer');
    }
  }, [session, open, totalAmount]);

  const handleCashChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setSplitCash(clean);
    const num = parseFloat(clean) || 0;
    if (num <= totalAmount) {
      setSplitUpi((totalAmount - num).toFixed(2));
    }
  };

  const handleUpiChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setSplitUpi(clean);
    const num = parseFloat(clean) || 0;
    if (num <= totalAmount) {
      setSplitCash((totalAmount - num).toFixed(2));
    }
  };

  const handleSelectMode = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === 'cash') {
      setSplitCash(totalAmount.toString());
      setSplitUpi('0');
    } else if (mode === 'upi') {
      setSplitCash('0');
      setSplitUpi(totalAmount.toString());
    } else if (mode === 'mixed') {
      const half = Math.floor(totalAmount / 2);
      setSplitCash(half.toString());
      setSplitUpi((totalAmount - half).toString());
    }
  };

  const cashVal = parseFloat(splitCash) || 0;
  const upiVal = parseFloat(splitUpi) || 0;
  const splitSum = Math.round((cashVal + upiVal) * 100) / 100;
  const roundedTotal = Math.round(totalAmount * 100) / 100;
  const isSplitValid = paymentMode !== 'mixed' || Math.abs(splitSum - roundedTotal) < 0.05;

  const handleSave = async () => {
    if (!session) return;
    if (paymentMode === 'mixed' && !isSplitValid) {
      toast.error(`Cash and UPI amounts must sum up to ₹ ${totalAmount.toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      let cashAmt = 0;
      let upiAmt = 0;
      let walletAmt = 0;

      if (paymentMode === 'cash') {
        cashAmt = totalAmount;
      } else if (paymentMode === 'upi') {
        upiAmt = totalAmount;
      } else if (paymentMode === 'mixed') {
        cashAmt = cashVal;
        upiAmt = upiVal;
      } else if (paymentMode === 'wallet') {
        walletAmt = totalAmount;
      }

      const updatePayload: Partial<Session> = {
        payment_mode: paymentMode,
        cash_amount: cashAmt,
        upi_amount: upiAmt,
        wallet_amount: walletAmt,
        split_breakdown: {
          cash: cashAmt,
          upi: upiAmt,
          wallet: walletAmt
        }
      };

      await db.sessions.update(session.id, updatePayload);

      // Update matching transactions if any
      try {
        const txs = await db.transactions.getAll();
        const relatedTxs = txs.filter(t => t.session_id === session.id);
        for (const tx of relatedTxs) {
          let updatedNote = `Session at ${stationName || 'Station'}`;
          if (paymentMode === 'cash') updatedNote += ' (Cash)';
          else if (paymentMode === 'upi') updatedNote += ' (UPI)';
          else if (paymentMode === 'mixed') updatedNote += ` (Split: ₹${cashAmt} Cash + ₹${upiAmt} UPI)`;
          else if (paymentMode === 'wallet') updatedNote += ' (Wallet)';
          else if (paymentMode === 'card') updatedNote += ' (Card)';
          await db.transactions.update(tx.id, { note: updatedNote });
        }
      } catch (txErr) {
        console.warn('Could not update matching transaction note:', txErr);
      }

      toast.success(`Payment mode updated to ${paymentMode.toUpperCase()}!`);
      onUpdated?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to update payment mode: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            Change Payment Mode
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Correct or switch payment mode for this completed session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Session Overview Box */}
          <div className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Station</span>
              <span className="font-bold text-foreground">{stationName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium text-indigo-300">{customerName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Date & Time</span>
              <span className="font-mono text-muted-foreground">
                {new Date(session.start_time).toLocaleDateString()} • {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-white/5">
              <span className="text-muted-foreground font-semibold">Total Bill</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                ₹ {totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Select New Payment Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectMode('cash')}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-bold transition-all ${
                  paymentMode === 'cash'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-400" />
                Cash
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('upi')}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-bold transition-all ${
                  paymentMode === 'upi'
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-sm shadow-indigo-500/10'
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-400" />
                UPI
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('mixed')}
                className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-bold transition-all ${
                  paymentMode === 'mixed'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10'
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Split className="w-4 h-4 text-amber-400" />
                Cash + UPI Split
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSelectMode('card')}
                className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                  paymentMode === 'card'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Card
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('wallet')}
                className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                  paymentMode === 'wallet'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                    : 'bg-black/20 border-white/10 text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                Wallet
              </button>
            </div>
          </div>

          {/* Split Mode Breakdown Inputs */}
          {paymentMode === 'mixed' && (
            <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                  <Split className="w-3.5 h-3.5" /> Split Amounts
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Must total ₹ {totalAmount.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Cash Amount (₹)</Label>
                  <Input
                    type="text"
                    value={splitCash}
                    onChange={(e) => handleCashChange(e.target.value)}
                    placeholder="0"
                    className="h-8 text-xs bg-background/50 border-amber-500/30 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">UPI Amount (₹)</Label>
                  <Input
                    type="text"
                    value={splitUpi}
                    onChange={(e) => handleUpiChange(e.target.value)}
                    placeholder="0"
                    className="h-8 text-xs bg-background/50 border-amber-500/30 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Quick Split Buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {[50, 100, 200].filter(amt => amt < totalAmount).map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSplitCash(amt.toString());
                      setSplitUpi((totalAmount - amt).toFixed(2));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-amber-200 border border-white/10 font-mono"
                  >
                    ₹{amt} Cash
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const half = Math.floor(totalAmount / 2);
                    setSplitCash(half.toString());
                    setSplitUpi((totalAmount - half).toFixed(2));
                  }}
                  className="px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-amber-200 border border-white/10 font-mono"
                >
                  50 / 50 Split
                </button>
              </div>

              {/* Validation Status */}
              <div className="pt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sum:</span>
                {isSplitValid ? (
                  <span className="text-emerald-400 font-bold font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ₹ {splitSum.toFixed(2)} (Balanced)
                  </span>
                ) : (
                  <span className="text-red-400 font-bold font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> ₹ {splitSum.toFixed(2)} (Diff: ₹ {(totalAmount - splitSum).toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || (paymentMode === 'mixed' && !isSplitValid)}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 font-bold"
          >
            {loading ? 'Saving...' : 'Update Payment Mode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
