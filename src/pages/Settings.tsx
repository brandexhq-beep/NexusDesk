import { useEffect, useState, useRef } from 'react';
import { db } from '../services/db';
import type { AppSettings, PricingRule } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Plus, Download, Upload, CheckCircle2, MessageCircle } from 'lucide-react';
import { PricingRuleModal } from '../components/PricingRuleModal';
import { QRCodeCanvas } from 'qrcode.react';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [formData, setFormData] = useState({
    cafe_name: '',
    cafe_logo_url: '',
    currency_symbol: '',
    tax_rate_percent: '',
    loyalty_conversion_rate: '',
    session_start_delay_sec: '',
    admin_password: '',
    google_review_url: '',
    review_delay_mins: ''
  });
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState<PricingRule[]>([]);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // WhatsApp status state
  const [waStatus, setWaStatus] = useState<{ready: boolean, qr: string | null}>({ ready: false, qr: null });
  const waIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (waIntervalRef.current) clearInterval(waIntervalRef.current);
    };
  }, []);

  const loadSettings = async () => {
    const data = await db.settings.get();
    const rulesData = await db.pricingRules.getAll();
    setSettings(data);
    setRules(rulesData);
    setFormData({
      cafe_name: data.cafe_name || '',
      cafe_logo_url: data.cafe_logo_url || '',
      currency_symbol: data.currency_symbol || '',
      tax_rate_percent: data.tax_rate_percent?.toString() || '0',
      loyalty_conversion_rate: data.loyalty_conversion_rate.toString(),
      session_start_delay_sec: data.session_start_delay_sec?.toString() || '0',
      admin_password: data.admin_password || 'admin',
      google_review_url: data.google_review_url || '',
      review_delay_mins: data.review_delay_mins?.toString() || '30'
    });
  };

  const startWhatsAppPolling = () => {
    const fetchWaStatus = async () => {
      try {
        const res = await fetch('http://localhost:3001/whatsapp-status');
        const json = await res.json();
        setWaStatus(json);
      } catch (e) {
        setWaStatus({ ready: false, qr: null });
      }
    };
    fetchWaStatus();
    waIntervalRef.current = window.setInterval(fetchWaStatus, 3000);
  };

  const stopWhatsAppPolling = () => {
    if (waIntervalRef.current) {
      clearInterval(waIntervalRef.current);
      waIntervalRef.current = null;
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await db.settings.update({
        cafe_name: formData.cafe_name,
        cafe_logo_url: formData.cafe_logo_url,
        currency_symbol: formData.currency_symbol,
        tax_rate_percent: Number(formData.tax_rate_percent),
        loyalty_conversion_rate: Number(formData.loyalty_conversion_rate),
        session_start_delay_sec: Number(formData.session_start_delay_sec),
        admin_password: formData.admin_password,
        google_review_url: formData.google_review_url,
        review_delay_mins: Number(formData.review_delay_mins)
      });
      await loadSettings();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = () => {
    try {
      const data = localStorage.getItem('brandex_db');
      if (!data) return alert('No data to backup.');
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_brandex_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Backup failed.');
    }
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        JSON.parse(content); // Validate JSON
        localStorage.setItem('brandex_db', content);
        alert('Data restored successfully! The application will now reload.');
        window.location.reload();
      } catch (err) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  if (!settings) return <div className="text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <Button onClick={handleSave} disabled={loading} className="bg-primary text-primary-foreground gap-2">
          <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full" onValueChange={(val) => val === 'whatsapp' ? startWhatsAppPolling() : stopWhatsAppPolling()}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl bg-black/40 border border-white/5 mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="pricing">Dynamic Pricing</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty System</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>
        
        {/* GENERAL TAB */}
        <TabsContent value="general" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Cafe Profile</CardTitle>
              <CardDescription>Basic information about your business.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Cafe Name</Label>
                  <Input 
                    value={formData.cafe_name} 
                    onChange={(e) => setFormData({...formData, cafe_name: e.target.value})}
                    className="border-white/10 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logo Image/GIF URL</Label>
                  <Input 
                    value={formData.cafe_logo_url} 
                    onChange={(e) => setFormData({...formData, cafe_logo_url: e.target.value})}
                    placeholder="https://example.com/logo.gif"
                    className="border-white/10 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency Symbol</Label>
                  <Input 
                    value={formData.currency_symbol} 
                    onChange={(e) => setFormData({...formData, currency_symbol: e.target.value})}
                    className="border-white/10 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Session Start Delay (Seconds)</Label>
                  <Input 
                    type="number" min="0"
                    value={formData.session_start_delay_sec} 
                    onChange={(e) => setFormData({...formData, session_start_delay_sec: e.target.value})}
                    placeholder="e.g. 5"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Countdown delay before a session starts tracking time.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Billing & Taxes</CardTitle>
              <CardDescription>Default tax configurations applied to checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label>Tax Rate (%)</Label>
                <div className="relative">
                  <Input 
                    type="number" 
                    value={formData.tax_rate_percent} 
                    onChange={(e) => setFormData({...formData, tax_rate_percent: e.target.value})}
                    className="border-white/10 bg-background/50 pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Security</CardTitle>
              <CardDescription>Manage your admin credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xs">
                <Label>Admin Password</Label>
                <Input 
                  type="password" 
                  value={formData.admin_password} 
                  onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                  className="border-white/10 bg-background/50"
                  placeholder="New password"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Data Management</CardTitle>
              <CardDescription>Backup and restore your local database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button onClick={handleBackup} variant="outline" className="border-white/10 gap-2">
                  <Download className="w-4 h-4" /> Backup Database
                </Button>
                <Label htmlFor="restore-upload" className="cursor-pointer">
                  <div className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-white/10 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 gap-2">
                    <Upload className="w-4 h-4" /> Restore Database
                  </div>
                </Label>
                <input 
                  id="restore-upload" 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleRestore} 
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRICING TAB */}
        <TabsContent value="pricing">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-card-foreground">Dynamic Pricing Rules</CardTitle>
                <CardDescription>Configure "Happy Hour" rules that automatically change hourly rates.</CardDescription>
              </div>
              <Button onClick={() => { setEditingRule(null); setIsRuleModalOpen(true); }} variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 gap-2">
                <Plus className="w-4 h-4" /> Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center border border-dashed border-white/10 rounded-lg">No pricing rules configured.</div>
              ) : (
                <div className="space-y-4">
                  {rules.map(rule => (
                    <div 
                      key={rule.id} 
                      onClick={() => { setEditingRule(rule); setIsRuleModalOpen(true); }}
                      className="cursor-pointer flex items-center justify-between p-4 border border-white/5 rounded-xl bg-black/20 hover:bg-black/40 transition-colors"
                    >
                      <div>
                        <h3 className="font-medium text-foreground text-lg">{rule.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 font-mono">
                          {rule.start_time} - {rule.end_time} | Days: {rule.days.join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-emerald-400 text-lg">{formData.currency_symbol} {rule.fixed_hourly_rate}/hr</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          rule.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-muted-foreground'
                        }`}>
                          {rule.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOYALTY TAB */}
        <TabsContent value="loyalty">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Loyalty Points</CardTitle>
              <CardDescription>Configure how loyalty points are earned and redeemed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Conversion Rate</Label>
                <div className="flex items-center gap-3">
                  <Input 
                    type="number" 
                    min="1"
                    value={formData.loyalty_conversion_rate} 
                    onChange={(e) => setFormData({...formData, loyalty_conversion_rate: e.target.value})}
                    className="border-white/10 bg-background/50 w-32"
                  />
                  <span className="text-muted-foreground">points equals {formData.currency_symbol} 1 discount.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WHATSAPP TAB */}
        <TabsContent value="whatsapp" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-400" /> WhatsApp Server Connection
              </CardTitle>
              <CardDescription>Scan the QR code to link your admin WhatsApp account for automated messages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center justify-center p-8">
              {waStatus.ready ? (
                <div className="flex flex-col items-center text-emerald-400 gap-3">
                  <CheckCircle2 className="w-16 h-16" />
                  <span className="text-lg font-bold">WhatsApp is Connected!</span>
                  <p className="text-sm text-emerald-400/70 text-center max-w-sm">
                    Invoices and 5-minute session reminders will be sent automatically from your linked account.
                  </p>
                </div>
              ) : waStatus.qr ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-xl">
                    <QRCodeCanvas value={waStatus.qr} size={256} />
                  </div>
                  <span className="text-muted-foreground font-medium animate-pulse">Waiting for scan...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-muted-foreground gap-3 py-8">
                  <div className="w-12 h-12 border-4 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                  <span>Connecting to WhatsApp Server... Make sure `npm run whatsapp` is running.</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Review Requests Configuration</CardTitle>
              <CardDescription>Configure when and how Google review requests are sent to customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <Label>Google Review URL</Label>
                  <Input 
                    value={formData.google_review_url} 
                    onChange={(e) => setFormData({...formData, google_review_url: e.target.value})}
                    placeholder="https://g.page/r/YOUR_UNIQUE_LINK/review"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">The link attached to the automated review request message.</p>
                </div>
                <div className="space-y-2">
                  <Label>Review Request Delay (Minutes)</Label>
                  <Input 
                    type="number" min="0"
                    value={formData.review_delay_mins} 
                    onChange={(e) => setFormData({...formData, review_delay_mins: e.target.value})}
                    placeholder="e.g. 30"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">How many minutes after a session ends should the review link be sent?</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PricingRuleModal 
        rule={editingRule} 
        isOpen={isRuleModalOpen} 
        onClose={() => setIsRuleModalOpen(false)} 
        onSave={loadSettings} 
      />

      <div className="pt-8 text-center">
        <a href="https://www.brandex.co.in" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground/60 hover:text-indigo-400 transition-colors">
          Built by Brandex
        </a>
      </div>
    </div>
  );
}
