import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';

interface AddStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
}

export function AddStationModal({ isOpen, onClose, onAdd }: AddStationModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('pc');
  const [hourlyRate, setHourlyRate] = useState('');
  const [gracePeriod, setGracePeriod] = useState('5');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !hourlyRate) return;
    setLoading(true);
    try {
      await db.stations.add({
        name,
        type,
        hourly_rate: Number(hourlyRate),
        status: 'free',
        grace_period_minutes: Number(gracePeriod),
        overtime_block_minutes: 15 // default
      });
      setName('');
      setHourlyRate('');
      setGracePeriod('5');
      setType('pc');
      onAdd();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>Add New Station</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Station Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="e.g., PC - 01"
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Station Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="border-border">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pc">PC</SelectItem>
                <SelectItem value="ps5">PS5</SelectItem>
                <SelectItem value="ps5_vr">PS5 VR</SelectItem>
                <SelectItem value="ps5_simracing">Sim Racing</SelectItem>
                <SelectItem value="snooker">Snooker</SelectItem>
              </SelectContent>
            </Select>
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
                placeholder="100"
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

          <Button onClick={handleSave} disabled={loading || !name || !hourlyRate} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4">
            {loading ? 'Adding...' : 'Add Station'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
