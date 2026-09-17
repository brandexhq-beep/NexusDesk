import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '../services/db';
import type { Station, Session, Customer, Game } from '../types';
import { SessionDetailsModal } from './SessionDetailsModal';
import { History, Clock, Users, Gamepad2 } from 'lucide-react';

interface StationHistoryModalProps {
  station: Station | null;
  onClose: () => void;
}

export function StationHistoryModal({ station, onClose }: StationHistoryModalProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  useEffect(() => {
    if (station) {
      setLoading(true);
      Promise.all([
        db.sessions.getAll(),
        db.customers.getAll(),
        db.games.getAll()
      ]).then(([allSessions, allCusts, allGames]) => {
        const stationSessions = allSessions
          .filter(s => s.station_id === station.id)
          .sort((a, b) => Number(b.start_time) - Number(a.start_time));

        setSessions(stationSessions);
        setCustomers(allCusts);
        setGames(allGames);
      }).finally(() => setLoading(false));
    }
  }, [station]);

  if (!station) return null;

  const getCustomerName = (cust_id: string | null) => {
    if (!cust_id) return 'Walk-in Customer';
    const c = customers.find(item => item.id === cust_id);
    if (!c) return 'Walk-in Customer';
    return c.phone ? `${c.name} (${c.phone})` : c.name;
  };

  const getGameNames = (game_ids?: string[]) => {
    if (!game_ids || game_ids.length === 0) return 'None specified';
    return game_ids.map(id => games.find(g => g.id === id)?.name || id).join(', ');
  };

  const lastSession = sessions.length > 0 ? sessions[0] : null;

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/10 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            Station Play History: {station.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete past play history and recent player logs for {station.name} ({station.type.toUpperCase()}).
          </DialogDescription>
        </DialogHeader>

        {/* Most Recent Player Card */}
        {lastSession && (
          <div className="bg-gradient-to-r from-indigo-950/40 to-black/40 border border-indigo-500/30 rounded-xl p-4 space-y-2 my-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Last Played On Station
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                lastSession.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-white/10 text-muted-foreground'
              }`}>
                {lastSession.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
              <div>
                <div className="text-muted-foreground">Player / Customer:</div>
                <div className="font-semibold text-foreground text-sm">{getCustomerName(lastSession.customer_id)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Games Played:</div>
                <div className="font-medium text-indigo-300 flex items-center gap-1">
                  <Gamepad2 className="w-3 h-3 text-indigo-400" /> {getGameNames(lastSession.game_ids)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Bill & Payment:</div>
                <div className="font-mono font-bold text-emerald-400 text-sm">
                  ₹ {(lastSession.total_amount || lastSession.base_amount || 0).toFixed(2)} ({lastSession.payment_mode || 'Pending'})
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session History Table */}
        <div className="space-y-2 mt-2">
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> All Session Logs ({sessions.length})
          </h3>

          <div className="border border-white/10 rounded-lg overflow-x-auto bg-black/20">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading station history...</div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No session history recorded for this station yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent text-xs uppercase">
                    <TableHead className="text-muted-foreground">Date & Time</TableHead>
                    <TableHead className="text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-muted-foreground">Game(s)</TableHead>
                    <TableHead className="text-muted-foreground text-center">Players</TableHead>
                    <TableHead className="text-muted-foreground text-right">Amount</TableHead>
                    <TableHead className="text-muted-foreground text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(s => {
                    const startMs = new Date(s.start_time).getTime();
                    const endMs = s.end_time ? new Date(s.end_time).getTime() : Date.now();
                    const durationMins = Math.max(1, Math.round((endMs - startMs) / 60000));

                    return (
                      <TableRow key={s.id} className="border-border hover:bg-white/5 text-xs">
                        <TableCell className="font-medium">
                          <div>{new Date(s.start_time).toLocaleDateString()}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({durationMins}m)
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{getCustomerName(s.customer_id)}</TableCell>
                        <TableCell className="text-indigo-300 max-w-[150px] truncate">{getGameNames(s.game_ids)}</TableCell>
                        <TableCell className="text-center font-mono">{s.num_players || 1}P</TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-400">
                          ₹ {(s.total_amount || s.base_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedSession(s)}
                            className="h-7 text-[11px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <SessionDetailsModal 
          session={selectedSession} 
          station={station}
          onClose={() => setSelectedSession(null)} 
        />
      </DialogContent>
    </Dialog>
  );
}
