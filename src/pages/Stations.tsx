import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Station, Game } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditStationModal } from '../components/EditStationModal';
import { AddStationModal } from '../components/AddStationModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { StationHistoryModal } from '../components/StationHistoryModal';
import { PricingChartModal } from '../components/PricingChartModal';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Gamepad2, History, BarChart3 } from 'lucide-react';

export function Stations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [historyStation, setHistoryStation] = useState<Station | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stationToDelete, setStationToDelete] = useState<Station | null>(null);

  const loadStations = () => {
    Promise.all([db.stations.getAll(), db.games.getAll()]).then(([stData, gmData]) => {
      setStations(stData);
      setGames(gmData);
    });
  };

  useEffect(() => {
    loadStations();
  }, []);

  const toggleMaintenance = async (station: Station) => {
    const newStatus = station.status === 'maintenance' ? 'free' : 'maintenance';
    await db.stations.update(station.id, { status: newStatus });
    loadStations();
  };

  const handleDelete = async () => {
    if (stationToDelete) {
      await db.stations.delete(stationToDelete.id);
      setStationToDelete(null);
      loadStations();
    }
  };

  const moveStation = async (station: Station, direction: 'up' | 'down') => {
    const sorted = [...stations].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex(s => s.id === station.id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const currentOrder = sorted[idx].sort_order ?? idx;
    const targetOrder = sorted[targetIdx].sort_order ?? targetIdx;

    // Swap sort_order
    await db.stations.update(sorted[idx].id, { sort_order: targetOrder });
    await db.stations.update(sorted[targetIdx].id, { sort_order: currentOrder });
    loadStations();
  };

  const getCategoryMeta = (type: string) => {
    if (type.startsWith('ps5_sim')) return { label: '🏎️ SIM RACING', color: 'border-amber-500/30 text-amber-400' };
    if (type.startsWith('ps5_vr')) return { label: '🥽 VR GAMING', color: 'border-purple-500/30 text-purple-400' };
    if (type.startsWith('ps5')) return { label: '🎮 PS5 CONSOLES', color: 'border-indigo-500/30 text-indigo-400' };
    if (type === 'snooker' || type === 'pool') return { label: '🎱 SNOOKER & POOL', color: 'border-emerald-500/30 text-emerald-400' };
    if (type === 'pc') return { label: '💻 PC STATIONS', color: 'border-cyan-500/30 text-cyan-400' };
    return { label: '🎲 OTHER GAMING', color: 'border-white/20 text-muted-foreground' };
  };

  const sortedStations = [...stations].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Group stations by category
  const categories = Array.from(new Set(sortedStations.map(s => {
    if (s.type.startsWith('ps5_sim')) return 'sim';
    if (s.type.startsWith('ps5_vr')) return 'vr';
    if (s.type.startsWith('ps5')) return 'ps5';
    if (s.type === 'snooker' || s.type === 'pool') return 'pool';
    if (s.type === 'pc') return 'pc';
    return 'other';
  })));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Station Configuration</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Organize categories, customize rate matrices, and reorder stations easily.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => setIsPricingModalOpen(true)} variant="outline" className="flex-1 sm:flex-none border-border gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" /> Pricing Chart
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Add Station
          </Button>
        </div>
      </div>

      {categories.map(catKey => {
        const catStations = sortedStations.filter(s => {
          if (catKey === 'sim') return s.type.startsWith('ps5_sim');
          if (catKey === 'vr') return s.type.startsWith('ps5_vr');
          if (catKey === 'ps5') return s.type.startsWith('ps5') && !s.type.includes('sim') && !s.type.includes('vr');
          if (catKey === 'pool') return s.type === 'snooker' || s.type === 'pool';
          if (catKey === 'pc') return s.type === 'pc';
          return !s.type.startsWith('ps5') && s.type !== 'snooker' && s.type !== 'pool' && s.type !== 'pc';
        });

        if (catStations.length === 0) return null;
        const meta = getCategoryMeta(catStations[0].type);

        return (
          <div key={catKey} className="space-y-3">
            <div className={`flex items-center gap-2 pb-1 border-b border-white/10 ${meta.color}`}>
              <h2 className="text-sm font-bold tracking-wider">{meta.label}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-mono">
                {catStations.length} units
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {catStations.map((s) => {
                const isFree = s.status === 'free';
                const isOccupied = s.status === 'occupied';
                const isMaintenance = s.status === 'maintenance';

                const installedCount = (s.installed_games || []).length;
                const installedNames = (s.installed_games || []).map(id => games.find(g => g.id === id)?.name).filter(Boolean);

                return (
                  <Card 
                    key={s.id} 
                    className={`bg-black/40 backdrop-blur-md transition-all duration-300 relative overflow-hidden group ${
                      isFree ? 'border-cyan-500/20 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10' :
                      isOccupied ? 'border-fuchsia-500/30 shadow-md shadow-fuchsia-500/10' :
                      'border-slate-500/20 opacity-70'
                    }`}
                  >
                    {/* Top accent line */}
                    <div className={`absolute top-0 left-0 w-full h-1 ${
                      isFree ? 'bg-cyan-500' :
                      isOccupied ? 'bg-fuchsia-500' :
                      'bg-slate-500'
                    }`} />

                    <CardHeader className="pb-3 border-b border-white/5">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl font-bold tracking-tight">{s.name}</CardTitle>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">{s.type.replace('_', ' ')}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                            isFree ? 'bg-cyan-500/10 text-cyan-400' :
                            isOccupied ? 'bg-fuchsia-500/10 text-fuchsia-400 animate-pulse' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {s.status}
                          </span>
                          
                          {/* Up & Down Reordering Controls */}
                          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-1 py-0.5">
                            <button 
                              onClick={() => moveStation(s, 'up')} 
                              className="text-xs text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                              title="Move Up"
                            >
                              ⬆️
                            </button>
                            <button 
                              onClick={() => moveStation(s, 'down')} 
                              className="text-xs text-muted-foreground hover:text-white px-1 hover:bg-white/10 rounded" 
                              title="Move Down"
                            >
                              ⬇️
                            </button>
                            {isFree && (
                              <button onClick={() => setStationToDelete(s)} className="text-red-400 hover:text-red-300 ml-1">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="py-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Base Hourly Rate</span>
                        <span className="font-mono text-base text-white font-medium">₹ {s.hourly_rate}</span>
                      </div>
                      {s.rate_30min ? (
                        <div className="flex items-center justify-between text-xs text-emerald-400">
                          <span>30-Min Rate</span>
                          <span className="font-mono font-medium">₹ {s.rate_30min}</span>
                        </div>
                      ) : null}
                      {installedCount > 0 ? (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
                            Games
                          </span>
                          <span className="font-medium text-cyan-400" title={installedNames.join(', ')}>
                            {installedCount} installed
                          </span>
                        </div>
                      ) : null}
                    </CardContent>

                    <div className="px-4 pb-3 pt-1 flex gap-1.5">
                      <button onClick={() => setHistoryStation(s)} className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs py-1.5 rounded-md transition-colors border border-indigo-500/20 flex items-center justify-center gap-1">
                        <History className="w-3 h-3" /> History
                      </button>
                      <button onClick={() => setEditingStation(s)} className="flex-1 bg-white/5 hover:bg-white/10 text-xs py-1.5 rounded-md text-foreground transition-colors border border-white/5 hover:border-white/10">
                        Edit Rate
                      </button>
                      <button onClick={() => toggleMaintenance(s)} disabled={isOccupied} className={`flex-1 text-xs py-1.5 rounded-md text-foreground transition-colors border ${isMaintenance ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/20 text-cyan-400' : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10'}`}>
                        {isMaintenance ? 'Enable' : 'Maint.'}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <StationHistoryModal
        station={historyStation}
        onClose={() => setHistoryStation(null)}
      />
      <PricingChartModal
        open={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
      />
      <EditStationModal 
        station={editingStation} 
        onClose={() => setEditingStation(null)} 
        onUpdate={loadStations} 
      />
      <AddStationModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={loadStations} 
      />
      <ConfirmModal
        open={!!stationToDelete}
        onClose={() => setStationToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Station"
        description={`Are you sure you want to delete ${stationToDelete?.name}? This action cannot be undone.`}
        confirmText="Delete Station"
      />
    </div>
  );
}
