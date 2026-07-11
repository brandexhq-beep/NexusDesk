import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { Station } from '../types';

interface EditStationModalProps {
  station: Station | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditStationModal({ station, onClose, onUpdate }: EditStationModalProps) {
  const [name, setName] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [gracePeriod, setGracePeriod] = useState('0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (station) {
      setName(station.name);
      setHourlyRate(station.hourly_rate.toString());
      setGracePeriod(station.grace_period_minutes?.toString() || '0');
    }
  }, [station]);

  const handleSave = async () => {
    if (!station) return;
    setLoading(true);
    try {
      await db.stations.update(station.id, {
        name,
        hourly_rate: Number(hourlyRate),
        grace_period_minutes: Number(gracePeriod)
      });
      onUpdate();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!station} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Station</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Station Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label>Hourly Rate</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
              <Input 
                type="number" min="0" step="1" 
                value={hourlyRate} 
                onChange={(e) => setHourlyRate(e.target.value)} 
                className="bg-background border-border pl-7"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Grace Period (Minutes)</Label>
            <div className="relative">
              <Input 
                type="number" min="0" step="1" 
                value={gracePeriod} 
                onChange={(e) => setGracePeriod(e.target.value)} 
                className="bg-background border-border pr-12"
              />
              <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">mins</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Free time before billing starts.</p>
          </div>

          <Button onClick={handleSave} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4">
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
