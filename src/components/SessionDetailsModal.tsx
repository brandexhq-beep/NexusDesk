import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Session, Station, Game } from '../types';
import { useEffect, useState } from 'react';
import { db } from '../services/db';

interface SessionDetailsModalProps {
  session: Session | null;
  station: Station | undefined;
  onClose: () => void;
  onEditPayment?: (session: Session) => void;
}

export function SessionDetailsModal({ session, station, onClose, onEditPayment }: SessionDetailsModalProps) {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (session && session.game_ids && session.game_ids.length > 0) {
      db.games.getAll().then(allGames => {
        setGames(allGames.filter(g => session.game_ids!.includes(g.id)));
      });
    } else {
      setGames([]);
    }
  }, [session]);

  if (!session) return null;

  const durationMins = session.end_time ? Math.floor((Number(session.end_time) - Number(session.start_time)) / 60000) : 0;

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Session Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">Station</span>
            <span className="font-medium">{station?.name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium">{durationMins} mins</span>
          </div>

          {games.length > 0 && (
            <div className="space-y-1 border-b border-border pb-2">
              <span className="text-muted-foreground block">Games Played</span>
              <div className="flex flex-wrap gap-1">
                {games.map(g => (
                  <span key={g.id} className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
                    {g.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {session.orders && session.orders.length > 0 && (
            <div className="space-y-1 border-b border-border pb-2">
              <span className="text-muted-foreground block">Food & Drinks</span>
              {session.orders.map((o, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{o.quantity}x {o.name}</span>
                  <span>₹ {(o.quantity * o.price_at_order).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center border-b border-border pb-2 text-xs">
            <span className="text-muted-foreground">Payment Mode</span>
            <span className="font-semibold uppercase tracking-wider text-indigo-300">
              {session.payment_mode === 'mixed'
                ? `Split (₹${session.cash_amount || 0} Cash + ₹${session.upi_amount || 0} UPI)`
                : session.payment_mode || 'Cash'}
            </span>
          </div>

          <div className="flex justify-between text-lg font-bold pt-2 text-emerald-400">
            <span>Total Billed</span>
            <span>₹ {session.total_amount?.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onEditPayment && (
            <Button
              onClick={() => {
                onClose();
                onEditPayment(session);
              }}
              variant="outline"
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs"
            >
              Change Payment Mode
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className={onEditPayment ? "text-xs" : "w-full text-xs"}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
