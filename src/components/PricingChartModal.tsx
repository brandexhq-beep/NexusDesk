import { useState, useEffect, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '../services/db';
import type { Station, PricingRule, PricingCategory } from '../types';
import { Layers, Edit3, Eye, Plus, Trash2, Check, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

interface PricingChartModalProps {
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  initialCategoryId?: string;
}

interface PriceDiff {
  duration: number;
  players: number;
  oldPrice: number;
  newPrice: number;
}

export function PricingChartModal({ open, onClose, onUpdate, initialCategoryId }: PricingChartModalProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [currencyStr, setCurrencyStr] = useState('₹');

  // Mode: 'view' or 'edit'
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Local editing state for active category
  const [localCategory, setLocalCategory] = useState<PricingCategory | null>(null);

  // Bulk adjustment inputs
  const [flatAmount, setFlatAmount] = useState<string>('');
  const [percentageAmount, setPercentageAmount] = useState<string>('');
  const [setValueAmount, setSetValueAmount] = useState<string>('');

  // Modals inside
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [copyFromCatId, setCopyFromCatId] = useState<string>('');

  const [showAddDurationModal, setShowAddDurationModal] = useState(false);
  const [newDurationMins, setNewDurationMins] = useState<string>('');

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [newPlayerCount, setNewPlayerCount] = useState<string>('');

  const [showStationModal, setShowStationModal] = useState(false);
  const [assignedStationIds, setAssignedStationIds] = useState<string[]>([]);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [priceDiffs, setPriceDiffs] = useState<PriceDiff[]>([]);
  const [changeReason, setChangeReason] = useState('Pricing adjustment');
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      const [stData, rules, catData, settings] = await Promise.all([
        db.stations.getAll(),
        db.pricingRules.getAll(),
        db.pricingCategories.getAll(),
        db.settings.get(),
      ]);
      setStations(stData);
      setPricingRules(rules.filter(r => r.active));
      setCategories(catData);
      if (settings?.currency_symbol) setCurrencyStr(settings.currency_symbol);

      if (catData.length > 0) {
        const targetId = (initialCategoryId && catData.some(c => c.id === initialCategoryId))
          ? initialCategoryId
          : (activeCategoryId && catData.some(c => c.id === activeCategoryId))
            ? activeCategoryId
            : catData[0].id;
        
        setActiveCategoryId(targetId);
        const activeCat = catData.find(c => c.id === targetId) || catData[0];
        setLocalCategory(JSON.parse(JSON.stringify(activeCat)));
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load pricing data');
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, initialCategoryId]);

  const handleSelectCategory = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    setActiveCategoryId(catId);
    setLocalCategory(JSON.parse(JSON.stringify(cat)));
  };

  const updateMatrixCell = (duration: number, players: number, value: number) => {
    if (!localCategory) return;
    const safeVal = Math.max(0, isNaN(value) ? 0 : Math.round(value));
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextMatrix = { ...prev.price_matrix };
      if (!nextMatrix[duration]) nextMatrix[duration] = {};
      nextMatrix[duration] = { ...nextMatrix[duration], [players]: safeVal };
      return { ...prev, price_matrix: nextMatrix };
    });
  };

  const applyFlatAdjustment = (delta: number) => {
    if (!localCategory) return;
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextMatrix: Record<number, Record<number, number>> = {};
      for (const d of prev.durations) {
        nextMatrix[d] = {};
        for (const p of prev.player_counts) {
          const oldVal = prev.price_matrix[d]?.[p] || 0;
          nextMatrix[d][p] = Math.max(0, oldVal + delta);
        }
      }
      return { ...prev, price_matrix: nextMatrix };
    });
    toast.success(`Adjusted all prices by ${delta >= 0 ? '+' : ''}${currencyStr}${delta}`);
  };

  const applyPercentAdjustment = (percent: number) => {
    if (!localCategory) return;
    const factor = 1 + percent / 100;
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextMatrix: Record<number, Record<number, number>> = {};
      for (const d of prev.durations) {
        nextMatrix[d] = {};
        for (const p of prev.player_counts) {
          const oldVal = prev.price_matrix[d]?.[p] || 0;
          nextMatrix[d][p] = Math.max(0, Math.round(oldVal * factor));
        }
      }
      return { ...prev, price_matrix: nextMatrix };
    });
    toast.success(`Adjusted all prices by ${percent >= 0 ? '+' : ''}${percent}%`);
  };

  const applySetValue = (val: number) => {
    if (!localCategory || val <= 0) return;
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextMatrix: Record<number, Record<number, number>> = {};
      for (const d of prev.durations) {
        nextMatrix[d] = {};
        for (const p of prev.player_counts) {
          nextMatrix[d][p] = val;
        }
      }
      return { ...prev, price_matrix: nextMatrix };
    });
    toast.success(`Set all prices to ${currencyStr}${val}`);
  };

  const addDurationRow = () => {
    const mins = parseInt(newDurationMins, 10);
    if (isNaN(mins) || mins <= 0) {
      toast.error('Enter a valid duration in minutes');
      return;
    }
    if (localCategory?.durations.includes(mins)) {
      toast.error(`${mins} minutes already exists in this category`);
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextDurations = [...prev.durations, mins].sort((a, b) => a - b);
      const nextMatrix = { ...prev.price_matrix };
      nextMatrix[mins] = {};
      for (const p of prev.player_counts) {
        const hourly = prev.price_matrix[60]?.[p] || prev.hourly_rate || 200;
        nextMatrix[mins][p] = Math.round((mins / 60) * hourly);
      }
      return { ...prev, durations: nextDurations, price_matrix: nextMatrix };
    });
    setShowAddDurationModal(false);
    setNewDurationMins('');
    toast.success(`Added ${mins} minutes duration tier`);
  };

  const removeDurationRow = (duration: number) => {
    if (!localCategory) return;
    if (localCategory.durations.length <= 1) {
      toast.error('Category must have at least one duration tier');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextDurations = prev.durations.filter(d => d !== duration);
      const nextMatrix = { ...prev.price_matrix };
      delete nextMatrix[duration];
      return { ...prev, durations: nextDurations, price_matrix: nextMatrix };
    });
    toast.info(`Removed ${duration} minutes tier`);
  };

  const addPlayerColumn = () => {
    const pCount = parseInt(newPlayerCount, 10);
    if (isNaN(pCount) || pCount <= 0) {
      toast.error('Enter a valid number of players');
      return;
    }
    if (localCategory?.player_counts.includes(pCount)) {
      toast.error(`${pCount} Player column already exists`);
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextPlayerCounts = [...prev.player_counts, pCount].sort((a, b) => a - b);
      const nextMatrix = { ...prev.price_matrix };
      for (const d of prev.durations) {
        if (!nextMatrix[d]) nextMatrix[d] = {};
        const p1Rate = nextMatrix[d][1] || 100;
        const multiplier = 1 + (pCount - 1) * 0.4;
        nextMatrix[d][pCount] = Math.round(p1Rate * multiplier);
      }
      return { ...prev, player_counts: nextPlayerCounts, price_matrix: nextMatrix };
    });
    setShowAddPlayerModal(false);
    setNewPlayerCount('');
    toast.success(`Added ${pCount} Player column`);
  };

  const removePlayerColumn = (pCount: number) => {
    if (!localCategory) return;
    if (localCategory.player_counts.length <= 1) {
      toast.error('Category must have at least one player count column');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextPlayerCounts = prev.player_counts.filter(p => p !== pCount);
      const nextMatrix = { ...prev.price_matrix };
      for (const d of prev.durations) {
        if (nextMatrix[d]) {
          delete nextMatrix[d][pCount];
        }
      }
      return { ...prev, player_counts: nextPlayerCounts, price_matrix: nextMatrix };
    });
    toast.info(`Removed ${pCount} Player column`);
  };

  const handleOpenPreview = () => {
    if (!localCategory) return;
    const original = categories.find(c => c.id === localCategory.id);
    if (!original) return;

    const diffs: PriceDiff[] = [];
    for (const d of localCategory.durations) {
      for (const p of localCategory.player_counts) {
        const oldPrice = original.price_matrix[d]?.[p] ?? 0;
        const newPrice = localCategory.price_matrix[d]?.[p] ?? 0;
        if (oldPrice !== newPrice) {
          diffs.push({ duration: d, players: p, oldPrice, newPrice });
        }
      }
    }

    if (diffs.length === 0 &&
        JSON.stringify(original.durations) === JSON.stringify(localCategory.durations) &&
        JSON.stringify(original.player_counts) === JSON.stringify(localCategory.player_counts)) {
      toast.info('No price or tier changes detected');
      return;
    }

    setPriceDiffs(diffs);
    setShowPreviewModal(true);
  };

  const handleConfirmSave = async () => {
    if (!localCategory) return;
    startTransition(async () => {
      try {
        const updatedRate = localCategory.price_matrix[60]?.[1] || localCategory.hourly_rate;
        const payload: Partial<PricingCategory> = {
          name: localCategory.name,
          description: localCategory.description,
          durations: localCategory.durations,
          player_counts: localCategory.player_counts,
          price_matrix: localCategory.price_matrix,
          hourly_rate: updatedRate,
        };

        await db.pricingCategories.update(localCategory.id, payload);

        // Audit log entry
        try {
          await db.auditLogs.add({
            action: 'PRICING_UPDATED',
            entity_type: 'pricing_category',
            entity_id: localCategory.id,
            details: `Updated ${localCategory.name}: ${priceDiffs.length} price change(s). Reason: ${changeReason}`
          });
        } catch (_) {}

        toast.success(`Saved pricing for "${localCategory.name}"`);
        setShowPreviewModal(false);
        setMode('view');
        await loadData();
        onUpdate?.();
      } catch (e) {
        console.error(e);
        toast.error('Failed to save category pricing');
      }
    });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      let baseDurations = [15, 30, 45, 60];
      let basePlayerCounts = [1, 2, 3, 4];
      let baseMatrix: Record<number, Record<number, number>> = {
        15: { 1: 50, 2: 70, 3: 95, 4: 110 },
        30: { 1: 100, 2: 140, 3: 190, 4: 220 },
        45: { 1: 150, 2: 210, 3: 280, 4: 330 },
        60: { 1: 200, 2: 280, 3: 380, 4: 450 },
      };

      if (copyFromCatId) {
        const source = categories.find(c => c.id === copyFromCatId);
        if (source) {
          baseDurations = [...source.durations];
          basePlayerCounts = [...source.player_counts];
          baseMatrix = JSON.parse(JSON.stringify(source.price_matrix));
        }
      }

      const newCat = await db.pricingCategories.add({
        name: newCatName.trim(),
        description: newCatDesc.trim() || undefined,
        sort_order: categories.length + 1,
        durations: baseDurations,
        player_counts: basePlayerCounts,
        price_matrix: baseMatrix,
        hourly_rate: baseMatrix[60]?.[1] || 200,
      });

      toast.success(`Created pricing category "${newCat.name}"`);
      setShowCreateModal(false);
      setNewCatName('');
      setNewCatDesc('');
      setCopyFromCatId('');
      await loadData();
      setActiveCategoryId(newCat.id);
      setLocalCategory(newCat);
      setMode('edit');
      onUpdate?.();
    } catch (e) {
      console.error(e);
      toast.error('Failed to create category');
    }
  };

  const openStationAssignment = (cat: PricingCategory) => {
    const assigned = stations.filter(s => s.pricing_category_id === cat.id).map(s => s.id);
    setAssignedStationIds(assigned);
    setShowStationModal(true);
  };

  const handleSaveStationAssignment = async () => {
    if (!localCategory) return;
    try {
      await db.stations.bulkAssignCategory(assignedStationIds, localCategory.id);
      toast.success(`Assigned ${assignedStationIds.length} stations to "${localCategory.name}"`);
      setShowStationModal(false);
      await loadData();
      onUpdate?.();
    } catch (e) {
      console.error(e);
      toast.error('Failed to assign stations');
    }
  };

  const activeCategoryOriginal = categories.find(c => c.id === activeCategoryId);
  const activeAssignedStations = stations.filter(s => s.pricing_category_id === activeCategoryId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-white/10 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-400">
              <Layers className="w-5 h-5" /> Pricing Chart & Rate Matrix
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live rate charts, duration tiers, player rates, and station category inheritance.
            </p>
          </div>
          
          <div className="flex items-center gap-2 pr-6">
            <div className="bg-black/40 border border-white/10 rounded-lg p-0.5 flex items-center text-xs">
              <button
                onClick={() => setMode('view')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                  mode === 'view' ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> View Rates
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                  mode === 'edit' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Matrix
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateModal(true)}
              className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New Category
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={activeCategoryId} onValueChange={handleSelectCategory} className="w-full mt-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <TabsList className="bg-black/40 border border-white/10 flex flex-wrap gap-1 h-auto p-1 max-w-3xl">
              {categories.map(cat => (
                <TabsTrigger key={cat.id} value={cat.id} className="text-xs font-semibold">
                  {cat.name}
                </TabsTrigger>
              ))}
              <TabsTrigger value="special-rules" className="text-xs font-semibold text-amber-300">
                Special Time Rules
              </TabsTrigger>
            </TabsList>
            
            {activeCategoryOriginal && (
              <span className="text-xs font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full">
                {activeAssignedStations.length} {activeAssignedStations.length === 1 ? 'Station' : 'Stations'} Assigned
              </span>
            )}
          </div>

          {/* SPECIAL RULES TAB */}
          <TabsContent value="special-rules" className="space-y-4 pt-3">
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 flex justify-between items-center">
              <div>
                <strong>Active Time Rules:</strong> Happy hours, night rates, or peak pricing rules configured in Settings.
              </div>
            </div>
            {pricingRules.length > 0 ? (
              <div className="space-y-2">
                {pricingRules.map(rule => (
                  <div key={rule.id} className="p-3 rounded-lg border border-amber-500/20 bg-amber-950/10 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-amber-300 text-sm">{rule.name}</div>
                      <div className="text-muted-foreground mt-0.5">
                        Time: {rule.start_time} - {rule.end_time}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-amber-400 font-bold text-sm">{currencyStr} {rule.fixed_hourly_rate}/hr</div>
                      <div className="text-[10px] text-amber-500/80">Active Rule Rate</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground bg-black/20 rounded-lg border border-white/5">
                No active time rules currently running. Configure special rules in Settings.
              </div>
            )}
          </TabsContent>

          {/* ACTIVE CATEGORY VIEW / EDIT */}
          {localCategory && (
            <TabsContent key={localCategory.id} value={localCategory.id} className="space-y-4 pt-3">
              {/* Category Info Header */}
              <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3 text-xs flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    {localCategory.name} Rates Matrix
                    <span className="font-mono text-indigo-400 font-normal">
                      ({currencyStr}{localCategory.price_matrix[60]?.[1] || localCategory.hourly_rate}/hr base)
                    </span>
                  </h3>
                  <p className="text-muted-foreground mt-0.5">{localCategory.description || 'Configured station rates'}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openStationAssignment(localCategory)}
                    className="text-xs border-white/10 hover:bg-white/10"
                  >
                    Assign Stations ({activeAssignedStations.length})
                  </Button>

                  {mode === 'view' ? (
                    <Button
                      size="sm"
                      onClick={() => setMode('edit')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Rates
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleOpenPreview}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Save Changes
                    </Button>
                  )}
                </div>
              </div>

              {/* EDIT MODE TOOLBAR */}
              {mode === 'edit' && (
                <div className="bg-black/40 border border-white/10 rounded-lg p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAddDurationModal(true)}
                        className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Duration Tier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAddPlayerModal(true)}
                        className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Player Column
                      </Button>
                    </div>

                    {/* Quick Delta Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground mr-1">Quick Bulk:</span>
                      <button
                        onClick={() => applyPercentAdjustment(10)}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30"
                      >
                        +10%
                      </button>
                      <button
                        onClick={() => applyPercentAdjustment(-10)}
                        className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-semibold border border-amber-500/30"
                      >
                        -10%
                      </button>
                      <button
                        onClick={() => applyFlatAdjustment(20)}
                        className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30"
                      >
                        +{currencyStr}20
                      </button>
                      <button
                        onClick={() => applyFlatAdjustment(50)}
                        className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30"
                      >
                        +{currencyStr}50
                      </button>
                      <button
                        onClick={() => applyFlatAdjustment(-20)}
                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-semibold border border-rose-500/30"
                      >
                        -{currencyStr}20
                      </button>
                    </div>
                  </div>

                  {/* Bulk Input Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        placeholder="Flat delta (e.g. 50)"
                        value={flatAmount}
                        onChange={e => setFlatAmount(e.target.value)}
                        className="h-8 text-xs bg-black/40 border-white/10"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const n = Number(flatAmount);
                          if (!isNaN(n) && n !== 0) {
                            applyFlatAdjustment(n);
                            setFlatAmount('');
                          }
                        }}
                        className="h-8 px-2.5 text-xs shrink-0"
                      >
                        Apply Flat
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        placeholder="Percent delta (e.g. 15)"
                        value={percentageAmount}
                        onChange={e => setPercentageAmount(e.target.value)}
                        className="h-8 text-xs bg-black/40 border-white/10"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const n = Number(percentageAmount);
                          if (!isNaN(n) && n !== 0) {
                            applyPercentAdjustment(n);
                            setPercentageAmount('');
                          }
                        }}
                        className="h-8 px-2.5 text-xs shrink-0"
                      >
                        Apply %
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        placeholder="Set all to (e.g. 200)"
                        value={setValueAmount}
                        onChange={e => setSetValueAmount(e.target.value)}
                        className="h-8 text-xs bg-black/40 border-white/10"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const n = Number(setValueAmount);
                          if (!isNaN(n) && n > 0) {
                            applySetValue(n);
                            setSetValueAmount('');
                          }
                        }}
                        className="h-8 px-2.5 text-xs shrink-0"
                      >
                        Set All
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* RATE TABLE / MATRIX */}
              <div className="overflow-x-auto border border-white/10 rounded-lg bg-black/20">
                <table className="w-full text-sm text-left">
                  <thead className="bg-black/40 text-muted-foreground text-xs uppercase border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 min-w-[130px]">Duration Tier</th>
                      {localCategory.player_counts.map(p => (
                        <th key={p} className="px-4 py-3 text-center min-w-[110px]">
                          <div className="flex items-center justify-center gap-1">
                            <span>{p} Player{p > 1 ? 's' : ''}</span>
                            {mode === 'edit' && localCategory.player_counts.length > 1 && (
                              <button
                                onClick={() => removePlayerColumn(p)}
                                title={`Delete ${p} Player column`}
                                className="text-rose-400 hover:text-rose-300 p-0.5 rounded ml-1"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      {mode === 'edit' && <th className="px-3 py-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {localCategory.durations.map(duration => (
                      <tr key={duration} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2.5 font-bold font-sans text-indigo-300 whitespace-nowrap">
                          {duration} Minutes
                        </td>
                        {localCategory.player_counts.map(p => {
                          const val = localCategory.price_matrix[duration]?.[p] ?? 0;
                          return (
                            <td key={p} className="px-3 py-2 text-center">
                              {mode === 'view' ? (
                                <span className="font-bold text-white px-2 py-1 rounded bg-white/5 border border-white/5">
                                  {currencyStr} {val}
                                </span>
                              ) : (
                                <div className="flex items-center justify-center">
                                  <span className="text-muted-foreground mr-1 font-mono text-xs">{currencyStr}</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={val}
                                    onChange={e => updateMatrixCell(duration, p, parseFloat(e.target.value))}
                                    className="w-20 h-7 text-center font-bold text-xs bg-black/60 border-white/20 focus:border-indigo-500"
                                  />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {mode === 'edit' && (
                          <td className="px-3 py-2 text-center">
                            {localCategory.durations.length > 1 && (
                              <button
                                onClick={() => removeDurationRow(duration)}
                                title={`Delete ${duration} mins row`}
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ASSIGNED STATIONS LIST */}
              {activeAssignedStations.length > 0 && (
                <div className="space-y-2 mt-4 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Assigned Stations ({activeAssignedStations.length})
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      Inherit this category's rate chart automatically
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {activeAssignedStations.map(s => (
                      <div key={s.id} className="p-3 rounded-lg border border-white/10 bg-white/5 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-semibold text-foreground">{s.name}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{s.type}</div>
                        </div>
                        <div className="font-mono font-bold text-indigo-300">
                          {currencyStr} {localCategory.price_matrix[60]?.[1] || s.hourly_rate}/hr
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* MODAL: PRICE CHANGES PREVIEW DIFF */}
        <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
          <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-emerald-400">
                <Check className="w-5 h-5" /> Confirm Price Updates
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 mt-2 text-xs">
              <p className="text-muted-foreground">
                Review the changes for <strong>{localCategory?.name}</strong>. These new rates will apply to all future sessions on assigned stations.
              </p>

              {priceDiffs.length > 0 ? (
                <div className="max-h-60 overflow-y-auto border border-white/10 rounded-lg divide-y divide-white/5 bg-black/40">
                  {priceDiffs.map((diff, idx) => {
                    const delta = diff.newPrice - diff.oldPrice;
                    return (
                      <div key={idx} className="p-2.5 flex justify-between items-center font-mono">
                        <div>
                          <span className="font-sans font-semibold text-white">{diff.duration}m ({diff.players}P): </span>
                          <span className="text-muted-foreground line-through mr-1.5">{currencyStr}{diff.oldPrice}</span>
                          <span className="text-foreground font-bold">{currencyStr}{diff.newPrice}</span>
                        </div>
                        <span className={`font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {delta >= 0 ? '+' : ''}{currencyStr}{delta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-white/5 rounded-lg text-muted-foreground text-center">
                  Duration tier or player column structure updated.
                </div>
              )}

              <div className="space-y-1 pt-2">
                <Label className="text-xs">Reason for Price Change (Audit Log)</Label>
                <Input
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  placeholder="e.g., Weekend tariff update, new equipment rates"
                  className="h-8 text-xs bg-black/40 border-white/10"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPreviewModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmSave} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {isPending ? 'Saving...' : 'Apply & Save Rates'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL: ADD DURATION TIER */}
        <Dialog open={showAddDurationModal} onOpenChange={setShowAddDurationModal}>
          <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Add Duration Tier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Label className="text-xs">Duration in Minutes</Label>
              <Input
                type="number"
                placeholder="e.g. 15, 45, 90, 120"
                value={newDurationMins}
                onChange={e => setNewDurationMins(e.target.value)}
                className="text-xs"
              />
              <div className="flex gap-1.5 flex-wrap">
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <button
                    key={m}
                    onClick={() => setNewDurationMins(m.toString())}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono border border-white/5"
                  >
                    +{m}m
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowAddDurationModal(false)}>Cancel</Button>
              <Button size="sm" onClick={addDurationRow} className="bg-indigo-600 text-white">Add Tier</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL: ADD PLAYER COLUMN */}
        <Dialog open={showAddPlayerModal} onOpenChange={setShowAddPlayerModal}>
          <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Add Player Count Column</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <Label className="text-xs">Number of Players</Label>
              <Input
                type="number"
                placeholder="e.g. 3, 4, 5, 6"
                value={newPlayerCount}
                onChange={e => setNewPlayerCount(e.target.value)}
                className="text-xs"
              />
              <div className="flex gap-1.5 flex-wrap">
                {[2, 3, 4, 5, 6].map(p => (
                  <button
                    key={p}
                    onClick={() => setNewPlayerCount(p.toString())}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono border border-white/5"
                  >
                    {p} Players
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowAddPlayerModal(false)}>Cancel</Button>
              <Button size="sm" onClick={addPlayerColumn} className="bg-indigo-600 text-white">Add Column</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL: CREATE CATEGORY */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="bg-card text-card-foreground border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Create New Pricing Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2 text-xs">
              <div className="space-y-1">
                <Label>Category Name</Label>
                <Input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="e.g., PS5 VIP Lounge, Racing Sim Pro"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>Description (Optional)</Label>
                <Input
                  value={newCatDesc}
                  onChange={e => setNewCatDesc(e.target.value)}
                  placeholder="e.g., Premium leather chairs & 4K 120Hz displays"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>Copy Matrix Rates From</Label>
                <select
                  value={copyFromCatId}
                  onChange={e => setCopyFromCatId(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/10 bg-black/60 px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Standard Default Template</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>Copy from: {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateCategory} className="bg-indigo-600 text-white">Create Category</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL: ASSIGN STATIONS */}
        <Dialog open={showStationModal} onOpenChange={setShowStationModal}>
          <DialogContent className="bg-card text-card-foreground border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Assign Stations to "{localCategory?.name}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs">
              {stations.map(st => {
                const isSelected = assignedStationIds.includes(st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      setAssignedStationIds(prev =>
                        isSelected ? prev.filter(id => id !== st.id) : [...prev, st.id]
                      );
                    }}
                    className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-white/10 bg-black/20 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{st.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{st.type}</div>
                    </div>
                    {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </div>
                );
              })}
            </div>
            <DialogFooter className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowStationModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveStationAssignment} className="bg-indigo-600 text-white">Save Station Assignments</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
}
