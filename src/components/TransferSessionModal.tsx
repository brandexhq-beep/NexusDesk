import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Station, Session } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, Users } from 'lucide-react';
import { toast } from 'sonner';

interface TransferSessionModalProps {
  session: Session | null;
  currentStation: Station | null;
  allStations: Station[];
  onClose: () => void;
  onSuccess: () => void;
}

export function TransferSessionModal({
  session,
  currentStation,
  allStations,
  onClose,
  onSuccess
}: TransferSessionModalProps) {
  const [targetStationId, setTargetStationId] = useState<string>('');
  const [numPlayers, setNumPlayers] = useState<number>(session?.num_players || 1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      setNumPlayers(session.num_players || 1);
    }
  }, [session]);

  if (!session || !currentStation) return null;

  const availableTargetStations = allStations.filter(
    s => s.id !== currentStation.id && s.status === 'free'
  );

  const handleTransfer = async () => {
    if (!targetStationId) {
      toast.error('Please select a target station');
      return;
    }

    const targetStation = allStations.find(s => s.id === targetStationId);
    if (!targetStation) return;

    setLoading(true);
    try {
      // 1. Move active session to new station ID and update num_players
      await db.sessions.update(session.id, {
        station_id: targetStationId,
        num_players: numPlayers
      });

      // 2. Mark old station as free
      await db.stations.update(currentStation.id, { status: 'free' });

      // 3. Mark new station as occupied
      await db.stations.update(targetStationId, { status: 'occupied' });

      toast.success(`Session transferred from ${currentStation.name} to ${targetStation.name}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to transfer session');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlayersOnly = async () => {
    setLoading(true);
    try {
      await db.sessions.update(session.id, { num_players: numPlayers });
      toast.success(`Updated player count to ${numPlayers}P`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed to update player count');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
            Transfer & Manage Session
          </DialogTitle>
          <DialogDescription>
            Move player to another station or update player count mid-session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="p-3 bg-muted/40 rounded-lg border border-white/5 space-y-1">
            <p className="text-xs text-muted-foreground">Current Station</p>
            <p className="text-sm font-bold text-foreground">{currentStation.name}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Transfer to Station</Label>
            {availableTargetStations.length === 0 ? (
              <p className="text-xs text-orange-400 bg-orange-500/10 p-2 rounded border border-orange-500/20">
                No other free stations available right now.
              </p>
            ) : (
              <Select value={targetStationId} onValueChange={setTargetStationId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select target station..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {availableTargetStations.map(st => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name} (₹{st.hourly_rate}/hr)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <Label className="text-xs flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              Mid-Session Player Count
            </Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNumPlayers(p)}
                  className={`flex-1 py-1.5 text-xs rounded-md font-bold border transition-all ${
                    numPlayers === p
                      ? 'bg-cyan-500 border-cyan-400 text-black shadow-md'
                      : 'bg-black/30 border-white/10 text-muted-foreground hover:text-white'
                  }`}
                >
                  {p} Player{p > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {availableTargetStations.length > 0 && (
            <Button
              disabled={loading || !targetStationId}
              onClick={handleTransfer}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 flex-1"
            >
              <ArrowRightLeft className="w-4 h-4" /> Transfer Station
            </Button>
          )}
          <Button
            disabled={loading}
            variant="outline"
            onClick={handleUpdatePlayersOnly}
            className="border-white/10 flex-1"
          >
            Update Players Only
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
