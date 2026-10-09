import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { db } from '../services/db';
import type { Customer } from '../types';
import { findDuplicateCustomerGroups, normalizePhoneDisplay, type DuplicateCustomerGroup } from '../lib/phone';
import { Users, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, ShieldCheck, Phone, Coins, Wallet, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MergeDuplicatesModalProps {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
  customers: Customer[];
}

export function MergeDuplicatesModal({ open, onClose, onMerged, customers }: MergeDuplicatesModalProps) {
  const [selectedPrimaries, setSelectedPrimaries] = useState<Record<string, string>>({});
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [isMergingAll, setIsMergingAll] = useState(false);

  // Group duplicates dynamically
  const duplicateGroups = useMemo(() => {
    return findDuplicateCustomerGroups(customers);
  }, [customers]);

  // Set default primary selections
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const group of duplicateGroups) {
      initial[group.canonicalKey] = group.suggestedPrimaryId;
    }
    setSelectedPrimaries(initial);
  }, [duplicateGroups]);

  const handleMergeGroup = async (group: DuplicateCustomerGroup) => {
    const targetId = selectedPrimaries[group.canonicalKey] || group.suggestedPrimaryId;
    const targetCust = group.customers.find(c => c.id === targetId) || group.customers[0];
    const duplicateIds = group.customers.filter(c => c.id !== targetId).map(c => c.id);

    if (duplicateIds.length === 0) return;

    setMergingKey(group.canonicalKey);
    try {
      const mergedData: Partial<Customer> = {
        name: targetCust.name,
        phone: normalizePhoneDisplay(targetCust.phone || group.displayPhone),
        loyalty_points: group.totalLoyaltyPoints,
        wallet_balance: group.totalWalletBalance,
        available_minutes: group.totalAvailableMinutes,
        amount_owed: group.totalAmountOwed > 0 ? group.totalAmountOwed : undefined,
        loyalty_points_updated_at: Date.now(),
      };

      await db.customers.mergeDuplicates({
        targetCustomerId: targetId,
        duplicateCustomerIds: duplicateIds,
        mergedData,
      });

      toast.success(`Merged ${group.customers.length} contacts for ${group.displayPhone}. Total Points: ${group.totalLoyaltyPoints}`);
      onMerged();
    } catch (err) {
      console.error(err);
      toast.error(`Failed to merge contacts for ${group.displayPhone}`);
    } finally {
      setMergingKey(null);
    }
  };

  const handleMergeAll = async () => {
    if (duplicateGroups.length === 0) return;
    setIsMergingAll(true);
    let successCount = 0;

    try {
      for (const group of duplicateGroups) {
        const targetId = selectedPrimaries[group.canonicalKey] || group.suggestedPrimaryId;
        const targetCust = group.customers.find(c => c.id === targetId) || group.customers[0];
        const duplicateIds = group.customers.filter(c => c.id !== targetId).map(c => c.id);

        if (duplicateIds.length === 0) continue;

        const mergedData: Partial<Customer> = {
          name: targetCust.name,
          phone: normalizePhoneDisplay(targetCust.phone || group.displayPhone),
          loyalty_points: group.totalLoyaltyPoints,
          wallet_balance: group.totalWalletBalance,
          available_minutes: group.totalAvailableMinutes,
          amount_owed: group.totalAmountOwed > 0 ? group.totalAmountOwed : undefined,
          loyalty_points_updated_at: Date.now(),
        };

        await db.customers.mergeDuplicates({
          targetCustomerId: targetId,
          duplicateCustomerIds: duplicateIds,
          mergedData,
        });
        successCount++;
      }

      toast.success(`Successfully resolved all duplicate groups (${successCount} merged)`);
      onMerged();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Encountered an error while merging duplicates');
    } finally {
      setIsMergingAll(false);
    }
  };

  const totalDuplicatesCount = duplicateGroups.reduce((acc, g) => acc + (g.customers.length - 1), 0);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <Users className="w-5 h-5 text-indigo-400" />
              Eliminate & Merge Duplicate Contacts
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identifies phone variations (e.g., "+91 9876543210", "+919876543210", "98765 43210"), pools loyalty points and balances, and merges into one canonical profile.
            </p>
          </div>

          {duplicateGroups.length > 0 && (
            <Button
              onClick={handleMergeAll}
              disabled={isMergingAll || !!mergingKey}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs gap-1.5 shadow-md shadow-indigo-600/20"
            >
              {isMergingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Merge All ({duplicateGroups.length} Groups)
            </Button>
          )}
        </DialogHeader>

        <div className="py-3 flex-1 overflow-y-auto space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3 bg-black/20 rounded-xl border border-white/5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No Duplicate Contacts Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                All customer records have unique phone numbers. When adding new customers or importing Excel sheets, phone numbers will be automatically normalized.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Found <strong>{duplicateGroups.length} duplicate groups</strong> ({totalDuplicatesCount} redundant records to eliminate).
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">Points & balances will be merged together.</span>
              </div>

              {duplicateGroups.map((group) => {
                const targetId = selectedPrimaries[group.canonicalKey] || group.suggestedPrimaryId;
                const isCurrentMerging = mergingKey === group.canonicalKey;

                return (
                  <div key={group.canonicalKey} className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-indigo-400" />
                        <span className="font-bold text-sm text-foreground font-mono">{group.displayPhone}</span>
                        <span className="text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                          {group.customers.length} Profiles
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleMergeGroup(group)}
                        disabled={isCurrentMerging || isMergingAll}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold self-end sm:self-auto h-7 px-3"
                      >
                        {isCurrentMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                        Merge This Group
                      </Button>
                    </div>

                    {/* Candidate Profiles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.customers.map((c) => {
                        const isPrimary = c.id === targetId;
                        return (
                          <div
                            key={c.id}
                            onClick={() => setSelectedPrimaries(prev => ({ ...prev, [group.canonicalKey]: c.id }))}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isPrimary
                                ? 'bg-indigo-950/30 border-indigo-500/50 shadow-sm'
                                : 'bg-white/5 border-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                  {c.name || 'Unnamed Customer'}
                                  {isPrimary && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-1.5 py-0.5 rounded">
                                      Primary Name
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                                  Phone: "{c.phone}"
                                </div>
                              </div>
                              <input
                                type="radio"
                                name={`primary_${group.canonicalKey}`}
                                checked={isPrimary}
                                onChange={() => setSelectedPrimaries(prev => ({ ...prev, [group.canonicalKey]: c.id }))}
                                className="accent-indigo-500 mt-1 cursor-pointer"
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t border-white/5 text-[11px] font-mono">
                              <div className="text-amber-400 flex items-center gap-1">
                                <Coins className="w-3 h-3 text-amber-500/80" />
                                <span>{c.loyalty_points || 0} Pts</span>
                              </div>
                              <div className="text-emerald-400 flex items-center gap-1">
                                <Wallet className="w-3 h-3 text-emerald-500/80" />
                                <span>₹{c.wallet_balance || 0}</span>
                              </div>
                              <div className="text-indigo-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-indigo-500/80" />
                                <span>{c.available_minutes || 0}m</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Merged Preview Outcome */}
                    <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2.5 text-xs text-emerald-300 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>Merged Result:</strong> Standardized Phone <code>{normalizePhoneDisplay(group.displayPhone)}</code></span>
                      </div>
                      <div className="flex items-center gap-3 font-mono font-bold text-xs">
                        <span className="text-amber-400">Total: {group.totalLoyaltyPoints} Pts</span>
                        <span className="text-emerald-400">Wallet: ₹{group.totalWalletBalance}</span>
                        <span className="text-indigo-400">Time: {group.totalAvailableMinutes}m</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            All linked sessions, invoices, and review requests will be seamlessly updated.
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
