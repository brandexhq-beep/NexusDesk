import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { db } from '../services/db';
import type { Station, PricingRule, AppSettings } from '../types';

interface PricingChartModalProps {
  open: boolean;
  onClose: () => void;
}

const PS5_PRICING_MATRIX: Record<number, Record<number, number>> = {
  5: { 1: 16, 2: 23, 3: 32, 4: 37 },
  15: { 1: 50, 2: 70, 3: 95, 4: 111 },
  30: { 1: 100, 2: 140, 3: 190, 4: 224 },
  45: { 1: 150, 2: 210, 3: 285, 4: 337 },
  60: { 1: 200, 2: 280, 3: 380, 4: 450 }
};

export function PricingChartModal({ open, onClose }: PricingChartModalProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (open) {
      Promise.all([
        db.stations.getAll(),
        db.pricingRules.getAll(),
        db.settings.get()
      ]).then(([st, rules, set]) => {
        setStations(st);
        setPricingRules(rules.filter(r => r.active));
        setSettings(set);
      });
    }
  }, [open]);

  const currencyStr = settings?.currency_symbol || '₹';

  const poolSnookerStations = stations.filter(s => s.type === 'pool' || s.type === 'snooker' || s.name.toLowerCase().includes('pool') || s.name.toLowerCase().includes('snooker'));
  const ps5Stations = stations.filter(s => s.type.startsWith('ps5'));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/10 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <span className="text-indigo-400">📊</span> Gaming & Station Pricing Chart
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete rate card for Console Gaming, Pool/Snooker Tables, PC Stations, and Special Rules.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ps5" className="mt-4">
          <TabsList className="bg-black/30 border border-white/10 p-1 grid grid-cols-4">
            <TabsTrigger value="ps5">🎮 PS5 & VR</TabsTrigger>
            <TabsTrigger value="pool">🎱 Pool & Snooker</TabsTrigger>
            <TabsTrigger value="stations">🖥️ All Stations</TabsTrigger>
            <TabsTrigger value="rules">⏰ Special Rules</TabsTrigger>
          </TabsList>

          {/* PS5 Rate Chart */}
          <TabsContent value="ps5" className="space-y-4 pt-3">
            <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-300">
              ⚡ <strong>Standard PS5 Matrix Rates:</strong> Rates scale automatically based on duration and player count.
            </div>

            <div className="overflow-x-auto border border-white/10 rounded-lg bg-black/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/40 text-muted-foreground text-xs uppercase border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3 text-center">1 Player</th>
                    <th className="px-4 py-3 text-center">2 Players</th>
                    <th className="px-4 py-3 text-center">3 Players</th>
                    <th className="px-4 py-3 text-center">4 Players</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-xs">
                  {Object.entries(PS5_PRICING_MATRIX).map(([mins, rates]) => (
                    <tr key={mins} className="hover:bg-white/5">
                      <td className="px-4 py-2.5 font-bold font-sans text-indigo-300">{mins} Minutes</td>
                      <td className="px-4 py-2.5 text-center">{currencyStr} {rates[1]}</td>
                      <td className="px-4 py-2.5 text-center">{currencyStr} {rates[2]}</td>
                      <td className="px-4 py-2.5 text-center">{currencyStr} {rates[3]}</td>
                      <td className="px-4 py-2.5 text-center">{currencyStr} {rates[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {ps5Stations.length > 0 && (
              <div className="space-y-2 mt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configured PS5 & VR Stations</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ps5Stations.map(s => (
                    <div key={s.id} className="p-3 rounded-lg border border-white/10 bg-white/5 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{s.type}</div>
                      </div>
                      <div className="font-mono font-bold text-indigo-300">
                        {currencyStr} {s.hourly_rate}/hr
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Pool & Snooker Rate Chart */}
          <TabsContent value="pool" className="space-y-4 pt-3">
            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
              🎱 <strong>Multiplayer Pool & Snooker Rates:</strong> Charges are calculated pro-rata per minute based on active player count.
            </div>

            <div className="overflow-x-auto border border-white/10 rounded-lg bg-black/20">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/40 text-muted-foreground text-xs uppercase border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3">Player Count</th>
                    <th className="px-4 py-3 text-center">Rate Scale</th>
                    <th className="px-4 py-3 text-center">Est. 30 Mins</th>
                    <th className="px-4 py-3 text-center">Est. 1 Hour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-xs">
                  <tr className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-bold font-sans text-emerald-300">1 Player (Solo)</td>
                    <td className="px-4 py-2.5 text-center">100% Base Rate</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 75</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 150</td>
                  </tr>
                  <tr className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-bold font-sans text-emerald-300">2 Players (Duo)</td>
                    <td className="px-4 py-2.5 text-center">140% Base Rate</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 105</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 210</td>
                  </tr>
                  <tr className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-bold font-sans text-emerald-300">3 Players</td>
                    <td className="px-4 py-2.5 text-center">180% Base Rate</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 135</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 270</td>
                  </tr>
                  <tr className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-bold font-sans text-emerald-300">4+ Players (Squad)</td>
                    <td className="px-4 py-2.5 text-center">220% Base Rate</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 165</td>
                    <td className="px-4 py-2.5 text-center">{currencyStr} 330</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {poolSnookerStations.length > 0 && (
              <div className="space-y-2 mt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configured Pool & Snooker Tables</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {poolSnookerStations.map(s => (
                    <div key={s.id} className="p-3 rounded-lg border border-white/10 bg-white/5 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-foreground">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{s.type}</div>
                      </div>
                      <div className="font-mono font-bold text-emerald-300">
                        {currencyStr} {s.hourly_rate}/hr
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* All Stations */}
          <TabsContent value="stations" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stations.map(st => (
                <div key={st.id} className="p-3.5 rounded-lg border border-white/10 bg-black/20 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-foreground">{st.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">Type: {st.type.replace('_', ' ')}</div>
                    {st.player_rates && (
                      <div className="text-[10px] text-indigo-300 mt-1">
                        Custom Player Rates set
                      </div>
                    )}
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-base font-bold text-indigo-400">{currencyStr} {st.hourly_rate}</div>
                    <div className="text-[10px] text-muted-foreground">per hour</div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Special Rules */}
          <TabsContent value="rules" className="space-y-3 pt-3">
            {pricingRules.length > 0 ? (
              <div className="space-y-2">
                {pricingRules.map(rule => (
                  <div key={rule.id} className="p-3 rounded-lg border border-amber-500/20 bg-amber-950/10 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-amber-300 text-sm">{rule.name}</div>
                      <div className="text-muted-foreground mt-0.5">
                        Time: {rule.start_time} - {rule.end_time}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-amber-400 font-bold text-sm">{currencyStr} {rule.fixed_hourly_rate}/hr</div>
                      <div className="text-[10px] text-amber-500/80">Active Rule Rate</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground bg-black/20 rounded-lg border border-white/5">
                No active special time pricing rules configured.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
