import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Station } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditStationModal } from '../components/EditStationModal';

export function Stations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [editingStation, setEditingStation] = useState<Station | null>(null);

  const loadStations = () => {
    db.stations.getAll().then(setStations);
  };

  useEffect(() => {
    loadStations();
  }, []);

  const toggleMaintenance = async (station: Station) => {
    const newStatus = station.status === 'maintenance' ? 'free' : 'maintenance';
    await db.stations.update(station.id, { status: newStatus });
    loadStations();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Station Configuration</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {stations.map((s) => {
          const isFree = s.status === 'free';
          const isOccupied = s.status === 'occupied';
          const isMaintenance = s.status === 'maintenance';

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
                    <p className="text-sm text-muted-foreground uppercase tracking-widest mt-1">{s.type}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                    isFree ? 'bg-cyan-500/10 text-cyan-400' :
                    isOccupied ? 'bg-fuchsia-500/10 text-fuchsia-400 animate-pulse' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {s.status}
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Hourly Rate</span>
                  <span className="font-mono text-lg text-white font-medium">₹ {s.hourly_rate}</span>
                </div>
              </CardContent>

              <div className="px-6 pb-4 pt-2 flex gap-2">
                <button onClick={() => setEditingStation(s)} className="flex-1 bg-white/5 hover:bg-white/10 text-xs py-2 rounded-md text-foreground transition-colors border border-white/5 hover:border-white/10">
                  Edit Rate
                </button>
                <button onClick={() => toggleMaintenance(s)} disabled={isOccupied} className={`flex-1 text-xs py-2 rounded-md text-foreground transition-colors border ${isMaintenance ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/20 text-cyan-400' : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10'}`}>
                  {isMaintenance ? 'Enable' : 'Maintenance'}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <EditStationModal 
        station={editingStation} 
        onClose={() => setEditingStation(null)} 
        onUpdate={loadStations} 
      />
    </div>
  );
}
