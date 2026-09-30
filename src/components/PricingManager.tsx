import { useState, useEffect, useTransition } from 'react';
import { db } from '../services/db';
import type { PricingCategory, Station } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Layers, Check, RefreshCw, Layers3, Copy, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

interface PriceDiff {
  duration: number;
  players: number;
  oldPrice: number;
  newPrice: number;
}

export function PricingManager() {
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [localCategory, setLocalCategory] = useState<PricingCategory | null>(null);

  const [flatAmount, setFlatAmount] = useState<string>('');
  const [percentageAmount, setPercentageAmount] = useState<string>('');
  const [setValueAmount, setSetValueAmount] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [copyFromCatId, setCopyFromCatId] = useState<string>('');

  const [showAddDurationModal, setShowAddDurationModal] = useState(false);
  const [newDurationMins, setNewDurationMins] = useState<string>('');

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [newPlayerCount, setNewPlayerCount] = useState<string>('');

  const [showStationModal, setShowStationModal] = useState(false);
  const [selectedStationCategory, setSelectedStationCategory] = useState<PricingCategory | null>(null);
  const [assignedStationIds, setAssignedStationIds] = useState<string[]>([]);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [priceDiffs, setPriceDiffs] = useState<PriceDiff[]>([]);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, stns] = await Promise.all([
        db.pricingCategories.getAll(),
        db.stations.getAll(),
      ]);
      setCategories(cats);
      setStations(stns);

      if (cats.length > 0) {
        const currentActive = cats.find(c => c.id === activeCategoryId) || cats[0];
        setActiveCategoryId(currentActive.id);
        setLocalCategory(JSON.parse(JSON.stringify(currentActive)));
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load pricing categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectCategory = (cat: PricingCategory) => {
    setActiveCategoryId(cat.id);
    setLocalCategory(JSON.parse(JSON.stringify(cat)));
  };

  const currentOriginalCategory = categories.find(c => c.id === activeCategoryId);

  const updateMatrixCell = (duration: number, players: number, value: number) => {
    if (!localCategory) return;
    const safeVal = Math.max(0, isNaN(value) ? 0 : value);
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
    toast.success(`Adjusted all prices by ${delta >= 0 ? '+' : ''}₹${delta}`);
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
    toast.success(`Set all matrix prices to ₹${val}`);
  };

  const copyPlayerPricing = (sourceP: number, targetP: number) => {
    if (!localCategory) return;
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextMatrix = { ...prev.price_matrix };
      for (const d of prev.durations) {
        if (!nextMatrix[d]) nextMatrix[d] = {};
        nextMatrix[d][targetP] = nextMatrix[d][sourceP] || 0;
      }
      return { ...prev, price_matrix: nextMatrix };
    });
    toast.success(`Copied ${sourceP}P prices to ${targetP}P`);
  };

  const addDurationRow = () => {
    const mins = Number(newDurationMins);
    if (!mins || mins <= 0 || !localCategory) {
      toast.error('Please enter a valid duration in minutes');
      return;
    }
    if (localCategory.durations.includes(mins)) {
      toast.error('Duration already exists in matrix');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextDurations = [...prev.durations, mins].sort((a, b) => a - b);
      const nextMatrix = { ...prev.price_matrix };
      if (!nextMatrix[mins]) {
        nextMatrix[mins] = {};
        for (const p of prev.player_counts) {
          const hRate = nextMatrix[60]?.[p] || prev.hourly_rate || 200;
          nextMatrix[mins][p] = Math.round((mins / 60) * hRate);
        }
      }
      return { ...prev, durations: nextDurations, price_matrix: nextMatrix };
    });
    setShowAddDurationModal(false);
    setNewDurationMins('');
    toast.success(`Added ${mins} min duration tier`);
  };

  const removeDurationRow = (mins: number) => {
    if (!localCategory) return;
    if (localCategory.durations.length <= 1) {
      toast.error('Category must have at least one duration tier');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextDurations = prev.durations.filter(d => d !== mins);
      const nextMatrix = { ...prev.price_matrix };
      delete nextMatrix[mins];
      return { ...prev, durations: nextDurations, price_matrix: nextMatrix };
    });
  };

  const addPlayerColumn = () => {
    const pCount = Number(newPlayerCount);
    if (!pCount || pCount <= 0 || !localCategory) {
      toast.error('Please enter a valid player count');
      return;
    }
    if (localCategory.player_counts.includes(pCount)) {
      toast.error('Player count column already exists');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextCounts = [...prev.player_counts, pCount].sort((a, b) => a - b);
      const nextMatrix = { ...prev.price_matrix };
      for (const d of prev.durations) {
        if (!nextMatrix[d]) nextMatrix[d] = {};
        const p1Val = nextMatrix[d][1] || 100;
        nextMatrix[d][pCount] = Math.round(p1Val * (1 + (pCount - 1) * 0.4));
      }
      return { ...prev, player_counts: nextCounts, price_matrix: nextMatrix };
    });
    setShowAddPlayerModal(false);
    setNewPlayerCount('');
    toast.success(`Added ${pCount} Player column`);
  };

  const removePlayerColumn = (pCount: number) => {
    if (!localCategory) return;
    if (localCategory.player_counts.length <= 1) {
      toast.error('Category must have at least one player column');
      return;
    }
    setLocalCategory(prev => {
      if (!prev) return prev;
      const nextCounts = prev.player_counts.filter(p => p !== pCount);
      const nextMatrix = { ...prev.price_matrix };
      for (const d of prev.durations) {
        if (nextMatrix[d]) {
          delete nextMatrix[d][pCount];
        }
      }
      return { ...prev, player_counts: nextCounts, price_matrix: nextMatrix };
    });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      let initialDurations = [15, 30, 60];
      let initialPlayers = [1, 2, 3, 4];
      let initialMatrix: Record<number, Record<number, number>> = {
        15: { 1: 50, 2: 70, 3: 95, 4: 110 },
        30: { 1: 100, 2: 140, 3: 190, 4: 220 },
        60: { 1: 200, 2: 280, 3: 380, 4: 450 },
      };

      if (copyFromCatId) {
        const templateCat = categories.find(c => c.id === copyFromCatId);
        if (templateCat) {
          initialDurations = [...templateCat.durations];
          initialPlayers = [...templateCat.player_counts];
          initialMatrix = JSON.parse(JSON.stringify(templateCat.price_matrix));
        }
      }

      const created = await db.pricingCategories.add({
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        sort_order: categories.length + 1,
        durations: initialDurations,
        player_counts: initialPlayers,
        price_matrix: initialMatrix,
        hourly_rate: initialMatrix[60]?.[1] || 200,
      });

      toast.success(`Category "${created.name}" created!`);
      setShowCreateModal(false);
      setNewCatName('');
      setNewCatDesc('');
      setCopyFromCatId('');
      await loadData();
      setActiveCategoryId(created.id);
      setLocalCategory(JSON.parse(JSON.stringify(created)));
    } catch (e) {
      console.error(e);
      toast.error('Failed to create category');
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;

    const assignedCount = stations.filter(s => s.pricing_category_id === catId).length;
    if (assignedCount > 0) {
      toast.error(`Cannot delete category "${cat.name}". Reassign its ${assignedCount} stations first.`);
      return;
    }

    if (categories.length <= 1) {
      toast.error('At least one pricing category must remain.');
      return;
    }

    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
      await db.pricingCategories.delete(catId);
      toast.success(`Category "${cat.name}" deleted`);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete category');
    }
  };

  const triggerSavePreview = () => {
    if (!localCategory || !currentOriginalCategory) return;

    const diffs: PriceDiff[] = [];
    for (const d of localCategory.durations) {
      for (const p of localCategory.player_counts) {
        const oldP = currentOriginalCategory.price_matrix[d]?.[p] || 0;
        const newP = localCategory.price_matrix[d]?.[p] || 0;
        if (oldP !== newP) {
          diffs.push({ duration: d, players: p, oldPrice: oldP, newPrice: newP });
        }
      }
    }

    if (diffs.length === 0 && localCategory.name === currentOriginalCategory.name && localCategory.description === currentOriginalCategory.description) {
      toast.info('No price changes detected.');
      return;
    }

    setPriceDiffs(diffs);
    setShowPreviewModal(true);
  };

  const commitSaveCategory = async () => {
    if (!localCategory) return;
    startTransition(async () => {
      try {
        await db.pricingCategories.update(localCategory.id, {
          name: localCategory.name,
          description: localCategory.description,
          durations: localCategory.durations,
          player_counts: localCategory.player_counts,
          price_matrix: localCategory.price_matrix,
          hourly_rate: localCategory.price_matrix[60]?.[1] || localCategory.hourly_rate || 200,
          updated_at: Date.now(),
        });
        toast.success(`Pricing category "${localCategory.name}" updated successfully!`);
        setShowPreviewModal(false);
        await loadData();
      } catch (e) {
        console.error(e);
        toast.error('Failed to save category changes');
      }
    });
  };

  const openManageStations = (cat: PricingCategory) => {
    setSelectedStationCategory(cat);
    const assigned = stations.filter(s => s.pricing_category_id === cat.id).map(s => s.id);
    setAssignedStationIds(assigned);
    setShowStationModal(true);
  };

  const handleSaveStationAssignments = async () => {
    if (!selectedStationCategory) return;
    try {
      await db.stations.bulkAssignCategory(assignedStationIds, selectedStationCategory.id);
      toast.success(`Assigned ${assignedStationIds.length} stations to "${selectedStationCategory.name}"`);
      setShowStationModal(false);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to assign stations');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading Pricing Manager...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Category Selection Tabs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/40 border border-white/10 p-4 rounded-xl backdrop-blur-md">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-thin">
          {categories.map(cat => {
            const isSelected = cat.id === activeCategoryId;
            const assignedCount = stations.filter(s => s.pricing_category_id === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-xs sm:text-sm whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-400/30'
                    : 'bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white border border-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>{cat.name}</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-black/30 text-muted-foreground'}`}>
                  {assignedCount} {assignedCount === 1 ? 'Station' : 'Stations'}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Category
        </Button>
      </div>

      {/* Selected Category Details Header */}
      {localCategory && (
        <div className="bg-gradient-to-br from-indigo-950/20 via-black/40 to-purple-950/20 border border-white/10 p-5 rounded-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <Input
                  value={localCategory.name}
                  onChange={(e) => setLocalCategory(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  className="text-xl font-black bg-white/5 border-white/10 text-white w-64 h-10"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openManageStations(localCategory)}
                  className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 text-xs flex items-center gap-1.5"
                >
                  <Layers3 className="w-3.5 h-3.5" />
                  Manage Stations ({stations.filter(s => s.pricing_category_id === localCategory.id).length})
                </Button>
              </div>
              <Input
                value={localCategory.description || ''}
                placeholder="Category description..."
                onChange={(e) => setLocalCategory(prev => prev ? { ...prev, description: e.target.value } : prev)}
                className="text-xs text-muted-foreground bg-transparent border-transparent hover:border-white/10 focus:border-white/20 mt-1.5 w-full max-w-md"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setLocalCategory(JSON.parse(JSON.stringify(currentOriginalCategory)))}
                className="border-white/10 hover:bg-white/10 text-muted-foreground text-xs"
              >
                Reset
              </Button>
              <Button
                onClick={triggerSavePreview}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 px-5"
              >
                <Check className="w-4 h-4" />
                Save Category Pricing
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteCategory(localCategory.id)}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Delete Category"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-medium">Assigned Stations:</span>
            {stations.filter(s => s.pricing_category_id === localCategory.id).length === 0 ? (
              <span className="text-amber-400/80 italic text-[11px]">No stations currently assigned to this category.</span>
            ) : (
              stations
                .filter(s => s.pricing_category_id === localCategory.id)
                .map(s => (
                  <span key={s.id} className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-indigo-300 font-mono text-[11px]">
                    {s.name} ({s.type})
                  </span>
                ))
            )}
          </div>
        </div>
      )}
      {/* Bulk Operations Toolbar */}
      {localCategory && (
        <div className="bg-black/30 border border-white/10 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Bulk Operations Toolbar
            </h3>
            <span className="text-[11px] text-muted-foreground">Apply instant price modifications across all duration matrix cells</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
              <Label className="text-[11px] text-muted-foreground">Adjust All Prices by Flat ₹</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  placeholder="e.g. 10 or -10"
                  value={flatAmount}
                  onChange={(e) => setFlatAmount(e.target.value)}
                  className="h-8 text-xs bg-black/40 border-white/10"
                />
                <Button
                  size="sm"
                  onClick={() => { applyFlatAdjustment(Number(flatAmount)); setFlatAmount(''); }}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Apply
                </Button>
              </div>
              <div className="flex gap-1 pt-1">
                <button onClick={() => applyFlatAdjustment(10)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-indigo-300">+₹10</button>
                <button onClick={() => applyFlatAdjustment(20)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-indigo-300">+₹20</button>
                <button onClick={() => applyFlatAdjustment(-10)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-red-300">-₹10</button>
              </div>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
              <Label className="text-[11px] text-muted-foreground">Adjust All Prices by %</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  placeholder="e.g. 10 or -10"
                  value={percentageAmount}
                  onChange={(e) => setPercentageAmount(e.target.value)}
                  className="h-8 text-xs bg-black/40 border-white/10"
                />
                <Button
                  size="sm"
                  onClick={() => { applyPercentAdjustment(Number(percentageAmount)); setPercentageAmount(''); }}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Apply
                </Button>
              </div>
              <div className="flex gap-1 pt-1">
                <button onClick={() => applyPercentAdjustment(10)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-indigo-300">+10%</button>
                <button onClick={() => applyPercentAdjustment(20)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-indigo-300">+20%</button>
                <button onClick={() => applyPercentAdjustment(-10)} className="px-2 py-0.5 text-[10px] bg-white/10 hover:bg-white/20 rounded text-red-300">-10%</button>
              </div>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
              <Label className="text-[11px] text-muted-foreground">Set All Cells to Fixed ₹</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  placeholder="e.g. 200"
                  value={setValueAmount}
                  onChange={(e) => setSetValueAmount(e.target.value)}
                  className="h-8 text-xs bg-black/40 border-white/10"
                />
                <Button
                  size="sm"
                  onClick={() => { applySetValue(Number(setValueAmount)); setSetValueAmount(''); }}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Set
                </Button>
              </div>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
              <Label className="text-[11px] text-muted-foreground">Copy Column Pricing</Label>
              <div className="flex flex-wrap gap-1.5">
                {localCategory.player_counts.includes(1) && localCategory.player_counts.includes(2) && (
                  <button onClick={() => copyPlayerPricing(1, 2)} className="px-2 py-1 text-[10px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 rounded flex items-center gap-1">
                    <Copy className="w-3 h-3" /> 1P → 2P
                  </button>
                )}
                {localCategory.player_counts.includes(1) && localCategory.player_counts.includes(3) && (
                  <button onClick={() => copyPlayerPricing(1, 3)} className="px-2 py-1 text-[10px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 rounded flex items-center gap-1">
                    <Copy className="w-3 h-3" /> 1P → 3P
                  </button>
                )}
                {localCategory.player_counts.includes(1) && localCategory.player_counts.includes(4) && (
                  <button onClick={() => copyPlayerPricing(1, 4)} className="px-2 py-1 text-[10px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 rounded flex items-center gap-1">
                    <Copy className="w-3 h-3" /> 1P → 4P
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Pricing Matrix Grid */}
      {localCategory && (
        <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-white/5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{localCategory.name} Price Matrix</span>
                <span className="text-xs font-normal text-muted-foreground">(Durations × Player Counts)</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click any cell to edit price directly. Press Tab for next cell, Enter to confirm.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDurationModal(true)}
                className="border-white/10 hover:bg-white/10 text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Duration Tier
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPlayerModal(true)}
                className="border-white/10 hover:bg-white/10 text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Player Count
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-black/60 border-b border-white/10 text-muted-foreground uppercase font-bold text-[11px]">
                  <th className="p-3 text-left w-36 border-r border-white/10 sticky left-0 bg-black/80 backdrop-blur-md z-10">
                    Duration
                  </th>
                  {localCategory.player_counts.map(p => (
                    <th key={p} className="p-3 text-center border-r border-white/10 min-w-[120px]">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{p} {p === 1 ? 'Player' : 'Players'}</span>
                        {localCategory.player_counts.length > 1 && (
                          <button
                            onClick={() => removePlayerColumn(p)}
                            className="text-muted-foreground hover:text-red-400 p-0.5"
                            title={`Remove ${p} Player column`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="p-3 text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {localCategory.durations.map(duration => (
                  <tr key={duration} className="hover:bg-white/5 transition-colors group">
                    <td className="p-3 font-sans font-bold text-indigo-300 border-r border-white/10 sticky left-0 bg-black/80 backdrop-blur-md z-10">
                      {duration} Minutes
                    </td>

                    {localCategory.player_counts.map(p => {
                      const val = localCategory.price_matrix[duration]?.[p] ?? 0;
                      const origVal = currentOriginalCategory?.price_matrix[duration]?.[p];
                      const isModified = origVal !== undefined && origVal !== val;

                      return (
                        <td key={p} className={`p-2 border-r border-white/10 text-center relative ${isModified ? 'bg-amber-500/10' : ''}`}>
                          <div className="relative flex items-center justify-center">
                            <span className="absolute left-2 text-muted-foreground font-sans text-[11px]">₹</span>
                            <Input
                              type="number"
                              value={val}
                              onChange={(e) => updateMatrixCell(duration, p, Number(e.target.value))}
                              className={`w-full text-center pl-6 pr-2 h-9 font-bold text-sm bg-black/40 border-white/10 focus:border-indigo-500 font-mono ${
                                isModified ? 'text-amber-300 font-extrabold border-amber-500/50' : 'text-white'
                              }`}
                            />
                          </div>
                        </td>
                      );
                    })}

                    <td className="p-2 text-center">
                      <button
                        onClick={() => removeDurationRow(duration)}
                        className="text-muted-foreground hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                        title={`Remove ${duration} min duration row`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Create Category Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Create Pricing Category</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                placeholder="e.g. PS5 Pro, Racing Sim, Billiards"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="e.g. High performance gaming setup rates"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Copy Matrix Structure From (Optional)</Label>
              <select
                value={copyFromCatId}
                onChange={(e) => setCopyFromCatId(e.target.value)}
                className="w-full bg-background border border-border rounded-md p-2 text-sm text-foreground"
              >
                <option value="">Standard Default Matrix</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} className="bg-indigo-600 hover:bg-indigo-500 text-white">Create Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Duration Tier Modal */}
      <Dialog open={showAddDurationModal} onOpenChange={setShowAddDurationModal}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Duration Tier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Label>Duration (Minutes)</Label>
            <Input
              type="number"
              placeholder="e.g. 45, 90, 120"
              value={newDurationMins}
              onChange={(e) => setNewDurationMins(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDurationModal(false)}>Cancel</Button>
            <Button onClick={addDurationRow} className="bg-indigo-600 hover:bg-indigo-500 text-white">Add Row</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Player Count Modal */}
      <Dialog open={showAddPlayerModal} onOpenChange={setShowAddPlayerModal}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Player Count Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Label>Player Count (e.g. 5 for 5 Players)</Label>
            <Input
              type="number"
              placeholder="e.g. 5"
              value={newPlayerCount}
              onChange={(e) => setNewPlayerCount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPlayerModal(false)}>Cancel</Button>
            <Button onClick={addPlayerColumn} className="bg-indigo-600 hover:bg-indigo-500 text-white">Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Assigned Stations Modal */}
      <Dialog open={showStationModal} onOpenChange={setShowStationModal}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Stations to "{selectedStationCategory?.name}"</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-3 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">Select all stations that should inherit pricing from "{selectedStationCategory?.name}".</p>
            <div className="space-y-2">
              {stations.map(s => {
                const isChecked = assignedStationIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      if (isChecked) {
                        setAssignedStationIds(prev => prev.filter(id => id !== s.id));
                      } else {
                        setAssignedStationIds(prev => [...prev, s.id]);
                      }
                    }}
                    className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                      isChecked ? 'bg-indigo-500/15 border-indigo-500/40 text-white' : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">Type: {s.type}</div>
                    </div>
                    {isChecked ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStationModal(false)}>Cancel</Button>
            <Button onClick={handleSaveStationAssignments} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              Save Station Assignments ({assignedStationIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Changes Preview Modal (Mandatory Requirement) */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-300">
              <RefreshCw className="w-5 h-5" />
              Preview Price Changes ({priceDiffs.length})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <p className="text-xs text-muted-foreground">
              Review the updated pricing changes for category <strong>{localCategory?.name}</strong> before committing to the database. Active sessions will retain their starting rate.
            </p>

            <div className="border border-white/10 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-black/60 text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2 text-center">Players</th>
                    <th className="px-3 py-2 text-center">Old Price</th>
                    <th className="px-3 py-2 text-center">New Price</th>
                    <th className="px-3 py-2 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {priceDiffs.map((diff, idx) => {
                    const delta = diff.newPrice - diff.oldPrice;
                    return (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="px-3 py-2 font-sans font-medium text-white">{diff.duration} Mins</td>
                        <td className="px-3 py-2 text-center">{diff.players} Player{diff.players > 1 ? 's' : ''}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground line-through">₹{diff.oldPrice}</td>
                        <td className="px-3 py-2 text-center font-bold text-emerald-400">₹{diff.newPrice}</td>
                        <td className={`px-3 py-2 text-right font-bold ${delta >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
                          {delta >= 0 ? `+₹${delta}` : `-₹${Math.abs(delta)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPreviewModal(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={commitSaveCategory} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
              {isPending ? 'Applying...' : 'Apply Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
