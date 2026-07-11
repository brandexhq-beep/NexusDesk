import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { db } from '../services/db';
import type { Customer, Session, Station } from '../types';

interface CustomerProfileModalProps {
  customer: Customer | null;
  onClose: () => void;
}

export function CustomerProfileModal({ customer, onClose }: CustomerProfileModalProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customer) {
      setLoading(true);
      Promise.all([
        db.sessions.getAll(),
        db.stations.getAll()
      ]).then(([allSessions, allStations]) => {
        // Filter sessions for this customer that are finished
        const customerSessions = allSessions
          .filter(s => s.customer_id === customer.id && s.status === 'completed')
          .sort((a, b) => Number(b.start_time) - Number(a.start_time));
        
        setSessions(customerSessions);
        setStations(allStations);
      }).finally(() => setLoading(false));
    } else {
      setSessions([]);
    }
  }, [customer]);

  if (!customer) return null;

  const totalSpend = sessions.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
  const lastVisit = sessions.length > 0 ? new Date(sessions[0].start_time).toLocaleDateString() : 'Never';

  const getStationName = (id: string) => {
    return stations.find(s => s.id === id)?.name || 'Unknown';
  };

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">{customer.name}'s Profile</DialogTitle>
          <p className="text-muted-foreground">{customer.phone}</p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 my-4">
          <div className="bg-black/20 border border-white/5 p-4 rounded-xl text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Lifetime Spend</p>
            <p className="text-2xl font-bold text-emerald-400">₹ {totalSpend.toFixed(2)}</p>
          </div>
          <div className="bg-black/20 border border-white/5 p-4 rounded-xl text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Last Visit</p>
            <p className="text-2xl font-bold text-indigo-400">{lastVisit}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-lg border-b border-white/10 pb-2">Session History</h3>
          
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {loading ? (
              <p className="text-center text-muted-foreground py-4">Loading history...</p>
            ) : sessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No completed sessions found.</p>
            ) : (
              sessions.map(s => {
                const durationMins = s.end_time ? Math.floor((Number(s.end_time) - Number(s.start_time)) / 60000) : 0;
                
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/10 hover:bg-black/30 transition-colors">
                    <div>
                      <div className="font-medium">{getStationName(s.station_id)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.start_time).toLocaleDateString()} at {new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">₹ {s.total_amount?.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{durationMins} mins</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button onClick={onClose} variant="outline" className="w-full">Close Profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
