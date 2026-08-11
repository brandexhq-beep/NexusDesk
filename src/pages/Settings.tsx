import { useEffect, useState, useRef } from 'react';
import { db, whatsapp, updater } from '../services/db';
import type { AppSettings, PricingRule } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Plus, Download, Upload, CheckCircle2, MessageCircle, Trash2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { PricingRuleModal } from '../components/PricingRuleModal';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [formData, setFormData] = useState({
    cafe_name: '',
    cafe_logo_url: '',
    currency_symbol: '',
    loyalty_enabled: true,
    loyalty_conversion_rate: '',
    loyalty_expiry_enabled: false,
    loyalty_expiry_days: '',
    session_start_delay_sec: '',
    admin_password: '',
    google_review_url: '',
    review_delay_mins: '',
    special_discount_days: '',
    special_discount_percent: '',
    invoice_footer_msg: '',
    invoice_qr_type: 'none',
    invoice_upi_id: '',
    owner_phone: '',
    low_stock_threshold: '5'
  });
  const [loading, setLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [rules, setRules] = useState<PricingRule[]>([]);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // WhatsApp status state
  const [waStatus, setWaStatus] = useState<{ready: boolean, qr: string | null}>({ ready: false, qr: null });
  const [waQueue, setWaQueue] = useState<any[]>([]);
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
      loyalty_enabled: data.loyalty_enabled !== false, // Default to true if not set
      loyalty_conversion_rate: data.loyalty_conversion_rate.toString(),
      loyalty_expiry_enabled: !!data.loyalty_expiry_enabled,
      loyalty_expiry_days: data.loyalty_expiry_days?.toString() || '30',
      session_start_delay_sec: data.session_start_delay_sec?.toString() || '0',
      admin_password: data.admin_password || 'admin',
      google_review_url: data.google_review_url || '',
      review_delay_mins: data.review_delay_mins?.toString() || '30',
      special_discount_days: data.special_discount_days?.join(', ') || '',
      special_discount_percent: data.special_discount_percent?.toString() || '0',
      invoice_footer_msg: data.invoice_footer_msg || '',
      invoice_qr_type: data.invoice_qr_type || 'none',
      invoice_upi_id: data.invoice_upi_id || '',
      owner_phone: data.owner_phone || '',
      low_stock_threshold: data.low_stock_threshold?.toString() || '5'
    });
  };

  const startWhatsAppPolling = () => {
    const fetchWaStatus = async () => {
      try {
        const json = await whatsapp.getStatus();
        setWaStatus(json || { ready: false, qr: null });
        
        try {
          const queueJson = await db.whatsappQueue.getAll();
          setWaQueue(queueJson || []);
        } catch (eq) {
          // Ignore queue fetch error silently
        }
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

  const handleClearQueue = async () => {
    if (!window.confirm('Are you sure you want to clear the entire WhatsApp queue? This will drop all pending messages.')) return;
    try {
      await db.whatsappQueue.clear();
      setWaQueue([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQueueItem = async (id: string) => {
    try {
      await db.whatsappQueue.delete(id);
      setWaQueue(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleResendQueueItem = async (id: string) => {
    try {
      await db.whatsappQueue.resend(id);
      setWaQueue(prev => prev.map(item => item.id === id ? { ...item, status: 'pending', retryCount: 0 } : item));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await db.settings.update({
        cafe_name: formData.cafe_name,
        cafe_logo_url: formData.cafe_logo_url,
        currency_symbol: formData.currency_symbol,
        loyalty_enabled: formData.loyalty_enabled,
        loyalty_conversion_rate: Number(formData.loyalty_conversion_rate),
        loyalty_expiry_enabled: formData.loyalty_expiry_enabled,
        loyalty_expiry_days: Number(formData.loyalty_expiry_days),
        session_start_delay_sec: Number(formData.session_start_delay_sec),
        admin_password: formData.admin_password,
        google_review_url: formData.google_review_url,
        review_delay_mins: Number(formData.review_delay_mins),
        special_discount_days: formData.special_discount_days.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
        special_discount_percent: Number(formData.special_discount_percent),
        invoice_footer_msg: formData.invoice_footer_msg,
        invoice_qr_type: formData.invoice_qr_type as any,
        invoice_upi_id: formData.invoice_upi_id,
        owner_phone: formData.owner_phone,
        low_stock_threshold: Number(formData.low_stock_threshold)
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
        <TabsList className="flex flex-wrap h-auto w-full max-w-3xl bg-black/40 border border-white/5 mb-6 justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
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
                <div className="space-y-2">
                  <Label>Owner Phone Number (For Alerts)</Label>
                  <Input 
                    type="text" 
                    value={formData.owner_phone} 
                    onChange={(e) => setFormData({...formData, owner_phone: e.target.value})}
                    placeholder="e.g. 919876543210"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Receive WhatsApp alerts (e.g. for low inventory) on this number.</p>
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Warning Threshold</Label>
                  <Input 
                    type="number" min="0"
                    value={formData.low_stock_threshold} 
                    onChange={(e) => setFormData({...formData, low_stock_threshold: e.target.value})}
                    placeholder="e.g. 5"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Get alerted when a snack or drink drops below this number.</p>
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

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Application Updates</CardTitle>
              <CardDescription>Check for newer versions of Sara Gaming Zone Management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                disabled={checkingUpdate}
                className="border-white/10 bg-white/5 hover:bg-white/10 gap-2"
                onClick={async () => {
                  setCheckingUpdate(true);
                  toast.info('Checking for updates...');
                  try {
                    if ((window as any).api?.updater) {
                      await updater.checkForUpdates();
                      setTimeout(() => {
                        toast.success('Check complete. You are using the latest version!');
                        setCheckingUpdate(false);
                      }, 2500);
                    } else {
                      setTimeout(() => {
                        toast.info('Automatic update check is active in packaged production builds.');
                        setCheckingUpdate(false);
                      }, 1200);
                    }
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to check for updates');
                    setCheckingUpdate(false);
                  }
                }}
              >
                {checkingUpdate ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {checkingUpdate ? 'Checking for Updates...' : 'Check for Updates Now'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Updates are downloaded automatically in the background. A notification will appear when one is ready to install.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVOICE TAB */}
        <TabsContent value="invoice" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Invoice & Receipt Settings</CardTitle>
              <CardDescription>Configure the appearance and data printed on the POS receipt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Cafe Name (Printed on Receipt)</Label>
                  <Input 
                    value={formData.cafe_name} 
                    onChange={(e) => setFormData({...formData, cafe_name: e.target.value})}
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
                  <Label>Logo Image/GIF URL (Printed if available)</Label>
                  <Input 
                    value={formData.cafe_logo_url} 
                    onChange={(e) => setFormData({...formData, cafe_logo_url: e.target.value})}
                    placeholder="https://example.com/logo.gif"
                    className="border-white/10 bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Footer Message</Label>
                  <Input 
                    value={formData.invoice_footer_msg} 
                    onChange={(e) => setFormData({...formData, invoice_footer_msg: e.target.value})}
                    placeholder="Thank you for playing with us!"
                    className="border-white/10 bg-background/50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Receipt QR Code</CardTitle>
              <CardDescription>Embed a dynamic QR code at the bottom of the printed receipt.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>QR Code Type</Label>
                  <select
                    value={formData.invoice_qr_type}
                    onChange={(e) => setFormData({...formData, invoice_qr_type: e.target.value})}
                    className="flex h-10 w-full rounded-md border border-input bg-background/50 border-white/10 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="none">None</option>
                    <option value="review">Google Review Link</option>
                    <option value="upi">UPI Payment (Dynamic Amount)</option>
                  </select>
                </div>

                {formData.invoice_qr_type === 'upi' && (
                  <div className="space-y-2 max-w-md">
                    <Label>UPI ID (e.g. yourname@okaxis)</Label>
                    <Input 
                      value={formData.invoice_upi_id} 
                      onChange={(e) => setFormData({...formData, invoice_upi_id: e.target.value})}
                      placeholder="yourname@bank"
                      className="border-white/10 bg-background/50"
                    />
                    <p className="text-[10px] text-muted-foreground">The generated QR code will automatically request the final bill amount.</p>
                  </div>
                )}
                {formData.invoice_qr_type === 'review' && (
                  <p className="text-xs text-muted-foreground bg-white/5 p-3 rounded-lg border border-white/10">
                    The QR code will point to your configured Google Review URL in the WhatsApp settings tab.
                  </p>
                )}
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

          <Card className="bg-black/40 backdrop-blur-md border-white/10 mt-6">
            <CardHeader>
              <CardTitle className="text-card-foreground">Special Discount Days</CardTitle>
              <CardDescription>Automatically apply a discount on specific days of the month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Discount Days (Comma separated)</Label>
                  <Input 
                    value={formData.special_discount_days} 
                    onChange={(e) => setFormData({...formData, special_discount_days: e.target.value})}
                    placeholder="e.g. 16, 17"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Days of the month when discount applies.</p>
                </div>
                <div className="space-y-2">
                  <Label>Global Discount (%)</Label>
                  <div className="relative">
                    <Input 
                      type="number" min="0" max="100"
                      value={formData.special_discount_percent} 
                      onChange={(e) => setFormData({...formData, special_discount_percent: e.target.value})}
                      className="border-white/10 bg-background/50 pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">%</span>
                  </div>
                </div>
              </div>
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
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <Label className="text-base">Enable Loyalty System</Label>
                    <p className="text-xs text-muted-foreground mt-1">If disabled, customers will not earn or redeem points, and points will be hidden from invoices.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={formData.loyalty_enabled}
                      onChange={(e) => setFormData({...formData, loyalty_enabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className={`space-y-4 transition-opacity ${formData.loyalty_enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
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

                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Enable Points Expiration</Label>
                      <p className="text-xs text-muted-foreground mt-1">If enabled, unused points will automatically expire after a set time.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.loyalty_expiry_enabled}
                        onChange={(e) => setFormData({...formData, loyalty_expiry_enabled: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                  
                  {formData.loyalty_expiry_enabled && (
                    <div className="space-y-2 max-w-xs pl-4 border-l-2 border-emerald-500/50">
                      <Label>Expiration Time (Days)</Label>
                      <Input 
                        type="number" 
                        min="1"
                        value={formData.loyalty_expiry_days} 
                        onChange={(e) => setFormData({...formData, loyalty_expiry_days: e.target.value})}
                        className="border-white/10 bg-background/50"
                      />
                      <p className="text-[10px] text-muted-foreground">e.g., 30 for one month. A 1-week warning will be sent via WhatsApp.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-card-foreground flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-indigo-400" /> WhatsApp Server Connection
                </CardTitle>
                <CardDescription>Scan the QR code to link your admin WhatsApp account for automated messages.</CardDescription>
              </div>
              {!waStatus.ready && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 gap-2 shrink-0"
                  onClick={async () => {
                    try { await whatsapp.reconnect(); } catch (_) {}
                  }}
                >
                  <RefreshCw className="w-4 h-4" /> Reconnect
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center justify-center p-8">
              {waStatus.ready ? (
                <div className="flex flex-col items-center text-emerald-400 gap-3">
                  <CheckCircle2 className="w-16 h-16" />
                  <span className="text-lg font-bold">WhatsApp is Connected!</span>
                  <p className="text-sm text-emerald-400/70 text-center max-w-sm">
                    Invoices, session reminders, review requests and loyalty alerts will be sent automatically from your linked account.
                  </p>
                </div>
              ) : waStatus.qr ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-2xl">
                    <QRCodeCanvas value={waStatus.qr} size={256} />
                  </div>
                  <span className="text-muted-foreground font-medium animate-pulse">Waiting for scan — open WhatsApp on your phone and scan this code…</span>
                  <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
                    WhatsApp → Menu (⋮) → Linked Devices → Link a Device
                  </p>
                </div>
              ) : (waStatus as any).state === 'auth_failure' ? (
                <div className="flex flex-col items-center text-red-400 gap-3 py-8">
                  <AlertCircle className="w-12 h-12" />
                  <span className="font-bold">Authentication Failed</span>
                  <p className="text-sm text-red-400/70 text-center max-w-sm">Your session was rejected. A new QR code will appear shortly — please re-scan.</p>
                </div>
              ) : (waStatus as any).state === 'disconnected' ? (
                <div className="flex flex-col items-center text-orange-400 gap-3 py-8">
                  <AlertCircle className="w-12 h-12" />
                  <span className="font-bold">Disconnected</span>
                  <p className="text-sm text-orange-400/70 text-center max-w-sm">
                    {(waStatus as any).initError || 'Connection lost. Attempting to reconnect automatically…'}
                  </p>
                </div>
              ) : (waStatus as any).state === 'error' ? (
                <div className="flex flex-col items-center text-red-400 gap-3 py-8">
                  <AlertCircle className="w-12 h-12" />
                  <span className="font-bold">Server Error</span>
                  <p className="text-sm text-red-400/70 text-center max-w-sm">{(waStatus as any).initError || 'The WhatsApp browser process could not start.'}</p>
                  <p className="text-xs text-red-400/50">Make sure Chrome or Edge is installed on this computer.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-muted-foreground gap-3 py-8">
                  <div className="w-12 h-12 border-4 border-muted-foreground/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="font-medium">
                    {(waStatus as any).state === 'authenticated' ? 'Loading your linked account…' : 'Starting WhatsApp browser…'}
                  </span>
                  <p className="text-xs text-muted-foreground/50">This can take 20–60 seconds on first launch.</p>
                  {(waStatus as any).elapsedMs > 60000 && (
                    <p className="text-xs text-yellow-400/70">Taking longer than expected. If this persists, click Reconnect above.</p>
                  )}
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

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-card-foreground">WhatsApp Outbound Queue</CardTitle>
                <CardDescription>Monitor and manage pending messages. Failing messages drop automatically after 3 retries.</CardDescription>
              </div>
              <Button onClick={handleClearQueue} variant="destructive" size="sm" className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20">
                Clear Entire Queue
              </Button>
            </CardHeader>
            <CardContent>
              {waQueue.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center border border-dashed border-white/10 rounded-lg">Queue is currently empty.</div>
              ) : (
                <div className="space-y-3">
                  {waQueue.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between p-3 border border-white/5 rounded-xl bg-black/20">
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-foreground text-sm">{item.chatId.replace('@c.us', '')}</span>
                          <span className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</span>
                          {/* Status badge */}
                          {item.status === 'sent' && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">✓ Sent</span>
                          )}
                          {item.status === 'failed' && (
                            <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-bold">✗ Failed</span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-bold animate-pulse">⏳ Pending</span>
                          )}
                          {(item.retryCount || 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded font-bold">
                              <AlertCircle className="w-3 h-3" /> Retry {item.retryCount}/3
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[400px]">{item.message}</p>
                        {item.pdfName && <p className="text-[10px] text-indigo-400 mt-1">📎 {item.pdfName}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-4 shrink-0">
                        {(item.status === 'failed' || item.status === 'sent') && (
                          <Button
                            onClick={() => handleResendQueueItem(item.id)}
                            variant="ghost"
                            size="icon"
                            title="Re-queue this message"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 h-8 w-8"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        <Button onClick={() => handleDeleteQueueItem(item.id)} variant="ghost" size="icon" className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
