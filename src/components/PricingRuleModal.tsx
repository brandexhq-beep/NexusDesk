import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { db } from '../services/db';
import type { PricingRule } from '../types';

interface PricingRuleModalProps {
  rule: PricingRule | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function PricingRuleModal({ rule, isOpen, onClose, onSave }: PricingRuleModalProps) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [rate, setRate] = useState('');
  const [active, setActive] = useState(true);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default Mon-Fri
  const [loading, setLoading] = useState(false);

  const WEEKDAYS = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 }
  ];

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setStartTime(rule.start_time);
      setEndTime(rule.end_time);
      setRate(rule.fixed_hourly_rate?.toString() || '');
      setActive(rule.active);
      setDays(rule.days || [1, 2, 3, 4, 5]);
    } else {
      setName('');
      setStartTime('00:00');
      setEndTime('23:59');
      setRate('');
      setActive(true);
      setDays([1, 2, 3, 4, 5]);
    }
  }, [rule, isOpen]);

  const handleSave = async () => {
    if (!name || !rate) return;
    setLoading(true);
    try {
      if (rule) {
        await db.pricingRules.update(rule.id, {
          name,
          days,
          start_time: startTime,
          end_time: endTime,
          fixed_hourly_rate: Number(rate),
          active
        });
      } else {
        await db.pricingRules.add({
          name,
          days,
          start_time: startTime,
          end_time: endTime,
          fixed_hourly_rate: Number(rate),
          active
        });
      }
      onSave();
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
          <DialogTitle>{rule ? 'Edit Pricing Rule' : 'New Pricing Rule'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Rule Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="e.g. Happy Hour"
              className="bg-background border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input 
                type="time" 
                value={startTime} 
                onChange={(e) => setStartTime(e.target.value)} 
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input 
                type="time" 
                value={endTime} 
                onChange={(e) => setEndTime(e.target.value)} 
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hourly Rate (₹)</Label>
            <Input 
              type="number" min="0" 
              value={rate} 
              onChange={(e) => setRate(e.target.value)} 
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Active Days</Label>
            <div className="flex gap-1 bg-background/50 p-1 border border-border rounded-lg justify-between">
              {WEEKDAYS.map(day => {
                const isSelected = days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    onClick={() => {
                      if (isSelected) setDays(days.filter(d => d !== day.value));
                      else setDays([...days, day.value]);
                    }}
                    className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                      isSelected 
                        ? 'bg-emerald-500 text-white font-medium shadow-sm' 
                        : 'text-muted-foreground hover:bg-white/5'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border border-border p-3 rounded-md bg-background/50">
            <div className="space-y-0.5">
              <Label>Active Status</Label>
              <p className="text-[10px] text-muted-foreground">Is this rule currently active?</p>
            </div>
            <input 
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 bg-background border-border rounded cursor-pointer"
            />
          </div>

          <Button onClick={handleSave} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-4">
            {loading ? 'Saving...' : 'Save Rule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
