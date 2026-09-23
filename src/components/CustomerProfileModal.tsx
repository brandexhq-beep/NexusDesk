import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Customer, Session, Station } from '../types';
import { SessionDetailsModal } from './SessionDetailsModal';
import { isValidIndianPhone, formatIndianPhone } from '../lib/utils';
import { toast } from 'sonner';

interface CustomerProfileModalProps {
  customer: Customer | null;
  onClose: () => void;
}

export function CustomerProfileModal({ customer, onClose }: CustomerProfileModalProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (customer) {
      setLoading(true);
      setEditPhone(customer.phone ? customer.phone.replace('+91 ', '') : '');
      setIsEditingPhone(false);
      Promise.all([
        db.sessions.getAll(),
        db.stations.getAll(),
        db.settings.get()
      ]).then(([allSessions, allStations, settings]) => {
        // Filter sessions for this customer that are finished
        const customerSessions = allSessions
          .filter(s => s.customer_id === customer.id && s.status === 'completed')
          .sort((a, b) => Number(b.start_time) - Number(a.start_time));
        
        setSessions(customerSessions);
        setStations(allStations);
        setCurrency(settings.currency_symbol || '₹');
      }).finally(() => setLoading(false));
    } else {
      setSessions([]);
    }
  }, [customer]);

  if (!customer) return null;

  const handleSavePhone = async () => {
    if (editPhone.trim() && !isValidIndianPhone(editPhone)) {
      toast.error('Invalid phone number! Must be a 10-digit Indian mobile number starting with 6-9');
      return;
    }

    setSavingPhone(true);
    try {
      const formatted = editPhone.trim() ? formatIndianPhone(editPhone) : '';
      await db.customers.update(customer.id, { phone: formatted });
      customer.phone = formatted;
      setIsEditingPhone(false);
      toast.success('Phone number updated!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update phone number');
    } finally {
      setSavingPhone(false);
    }
  };

  const totalSpend = sessions.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
  const lastVisit = sessions.length > 0 ? new Date(sessions[0].start_time).toLocaleDateString() : 'Never';

  const getStationName = (s: Session) => {
    if ((s as any).station_name) return (s as any).station_name;
    if ((s as any).stationName) return (s as any).stationName;
    const found = stations.find(st => st.id === s.station_id);
    if (found) return found.name;
    if (s.station_id) return `Station ${s.station_id}`;
    return 'Gaming Session';
  };

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">{customer.name}'s Profile</DialogTitle>
          {isEditingPhone ? (
            <div className="flex items-center gap-2 mt-2">
              <div className="relative flex items-center flex-1">
                <span className="absolute left-3 text-muted-foreground text-xs">+91</span>
                <Input
                  value={editPhone}
                  maxLength={10}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                  className="pl-9 h-8 text-xs bg-background/50 border-white/10"
                  placeholder="9876543210"
                />
              </div>
              <Button size="sm" onClick={handleSavePhone} disabled={savingPhone} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditingPhone(false)} className="h-8 text-xs">
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-muted-foreground">{customer.phone || 'No phone number'}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditPhone(customer.phone ? customer.phone.replace('+91 ', '') : '');
                  setIsEditingPhone(true);
                }}
                className="h-6 px-2 text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
              >
                ✏️ Edit Phone
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 my-4">
          <div className="bg-black/20 border border-white/5 p-4 rounded-xl text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Lifetime Spend</p>
            <p className="text-2xl font-bold text-emerald-400">{currency} {totalSpend.toFixed(2)}</p>
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
                const startMs = new Date(s.start_time).getTime();
                const endMs = s.end_time ? new Date(s.end_time).getTime() : Date.now();
                const durationMins = Math.max(1, Math.round((endMs - startMs) / 60000));
                
                return (
                  <div 
                    key={s.id} 
                    onClick={() => setSelectedSession(s)}
                    className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/10 hover:bg-black/30 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-medium">{getStationName(s)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.start_time).toLocaleDateString()} at {new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{currency} {s.total_amount?.toFixed(2)}</div>
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
      <SessionDetailsModal 
        session={selectedSession} 
        station={stations.find(st => st.id === selectedSession?.station_id)}
        onClose={() => setSelectedSession(null)} 
      />
    </Dialog>
  );
}
