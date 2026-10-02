import { useEffect, useState, useRef } from 'react';
import { db, whatsapp, updater } from '../services/db';
import type { AppSettings, PricingRule } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Plus, Download, Upload, CheckCircle2, MessageCircle, Trash2, AlertCircle, RefreshCw, Loader2, ShieldAlert, LogOut, PowerOff, Phone, Smartphone } from 'lucide-react';
import { PricingRuleModal } from '../components/PricingRuleModal';
import { PricingManager } from '../components/PricingManager';
import { ConfirmPasswordModal } from '../components/ConfirmPasswordModal';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: async () => {}
  });
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
    low_stock_threshold: '5',
    whatsapp_session_reminders_enabled: true,
    session_reminder_mins_1: '15',
    session_reminder_mins_2: '5',
    session_reminder_end_enabled: true,
    wa_queue_cooldown_sec: '5',
    wa_template_warning_1: 'Hi {name}! Your session on {station} has {time} mins remaining.',
    wa_template_warning_2: 'Final Warning! Your session on {station} will end in {time} mins.',
    wa_template_end: 'Time is up for your session on {station}. Please proceed to checkout.'
  });
  const [loading, setLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  const [rules, setRules] = useState<PricingRule[]>([]);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // WhatsApp status state
  const [waStatus, setWaStatus] = useState<{ready: boolean, qr: string | null}>({ ready: false, qr: null });
  const [waQueue, setWaQueue] = useState<any[]>([]);
  const waIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();

    if ((window as any).api?.updater) {
      updater.onUpdateChecking(() => {
        setUpdateState('checking');
      });
      updater.onUpdateNotAvailable(() => {
        toast.dismiss();
        toast.success('Sara Gaming Zone is up to date!');
        setCheckingUpdate(false);
        setUpdateState('idle');
      });
      updater.onUpdateAvailable((info: any) => {
        setUpdateInfo(info);
        setUpdateState('available');
        setCheckingUpdate(false);
        toast.info(`Update v${info?.version} is available and downloading!`);
      });
      updater.onUpdateProgress((progressObj: any) => {
        setUpdateState('downloading');
        setUpdateProgress(Math.round(progressObj?.percent || 0));
      });
      updater.onUpdateDownloaded((info: any) => {
        setUpdateInfo(info);
        setUpdateState('ready');
        toast.success(`Update v${info?.version} downloaded and ready to install!`);
      });
      updater.onUpdateError((err: any) => {
        toast.dismiss();
        const msg = err?.message || '';
        if (msg.includes('404') || msg.includes('releases.atom')) {
          toast.success('Sara Gaming Zone is up to date!');
        } else {
          toast.error(`Update check: ${msg || 'Could not check updates'}`);
        }
        setCheckingUpdate(false);
        setUpdateState('idle');
      });
    }

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
      low_stock_threshold: data.low_stock_threshold?.toString() || '5',
      whatsapp_session_reminders_enabled: data.whatsapp_session_reminders_enabled !== false,
      session_reminder_mins_1: (data.session_reminder_mins_1 ?? 15).toString(),
      session_reminder_mins_2: (data.session_reminder_mins_2 ?? 5).toString(),
      session_reminder_end_enabled: data.session_reminder_end_enabled !== false,
      wa_queue_cooldown_sec: (data.wa_queue_cooldown_sec ?? 5).toString(),
      wa_template_warning_1: data.wa_template_warning_1 || 'Hi {name}! Your session on {station} has {time} mins remaining.',
      wa_template_warning_2: data.wa_template_warning_2 || 'Final Warning! Your session on {station} will end in {time} mins.',
      wa_template_end: data.wa_template_end || 'Time is up for your session on {station}. Please proceed to checkout.'
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

  const handleClearFailedQueue = async () => {
    const failedItems = waQueue.filter(item => item.status === 'failed');
    if (failedItems.length === 0) return;
    if (!window.confirm(`Clear ${failedItems.length} failed message(s) from the queue?`)) return;
    try {
      await Promise.all(failedItems.map(item => db.whatsappQueue.delete(item.id)));
      setWaQueue(prev => prev.filter(item => item.status !== 'failed'));
    } catch (e) {
      console.error(e);
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

  const [waActionLoading, setWaActionLoading] = useState(false);

  const handleWaReconnect = async () => {
    setWaActionLoading(true);
    try {
      await whatsapp.reconnect();
      toast.success('Reconnecting to WhatsApp...');
    } catch (e: any) {
      toast.error('Failed to reconnect: ' + (e?.message || 'Unknown error'));
    } finally {
      setTimeout(() => setWaActionLoading(false), 2000);
    }
  };

  const handleWaDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? Automated messages will be paused until reconnected.')) return;
    setWaActionLoading(true);
    try {
      await whatsapp.disconnect();
      toast.info('WhatsApp disconnected.');
    } catch (e: any) {
      toast.error('Failed to disconnect: ' + (e?.message || 'Unknown error'));
    } finally {
      setTimeout(() => setWaActionLoading(false), 1000);
    }
  };

  const handleWaLogout = async () => {
    if (!window.confirm('Are you sure you want to log out of WhatsApp? This will clear the linked session and generate a new QR code to scan.')) return;
    setWaActionLoading(true);
    try {
      await whatsapp.logout();
      toast.success('Logged out from WhatsApp. Generating new QR code...');
    } catch (e: any) {
      toast.error('Failed to logout: ' + (e?.message || 'Unknown error'));
    } finally {
      setTimeout(() => setWaActionLoading(false), 2000);
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
        low_stock_threshold: Number(formData.low_stock_threshold),
        whatsapp_session_reminders_enabled: formData.whatsapp_session_reminders_enabled,
        session_reminder_mins_1: Number(formData.session_reminder_mins_1),
        session_reminder_mins_2: Number(formData.session_reminder_mins_2),
        session_reminder_end_enabled: formData.session_reminder_end_enabled,
        wa_queue_cooldown_sec: Number(formData.wa_queue_cooldown_sec),
        wa_template_warning_1: formData.wa_template_warning_1,
        wa_template_warning_2: formData.wa_template_warning_2,
        wa_template_end: formData.wa_template_end
      });
      await loadSettings();
      toast.success('Settings saved successfully!');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    try {
      setLoading(true);
      toast.info('Generating database backup...');

      let backupData: any = null;
      if ((window as any).api?.db?.backup?.export) {
        backupData = await db.backup.exportBackup();
      } else {
        // Web dev fallback
        backupData = {
          version: 1,
          appName: 'Sara Gaming Zone',
          exportedAt: new Date().toISOString(),
          timestamp: Date.now(),
          settings: await db.settings.get(),
          stations: await db.stations.getAll(),
          customers: await db.customers.getAll(),
          sessions: await db.sessions.getAll(),
          menu: await db.menu.getAll(),
          transactions: await db.transactions.getAll(),
          pricing_rules: await db.pricingRules.getAll(),
          games: await db.games.getAll(),
          expenses: await db.expenses.getAll(),
          templates: await db.templates.getAll(),
        };
      }

      if (!backupData) {
        toast.error('No database data found to backup.');
        return;
      }

      const defaultFilename = `backup_sara_gaming_${new Date().toISOString().split('T')[0]}.json`;

      // If running inside Electron, use native Save Dialog
      if ((window as any).api?.dialog?.showSaveDialog && (window as any).api?.db?.backup?.writeExportFile) {
        const dialogRes = await (window as any).api.dialog.showSaveDialog(defaultFilename);
        if (!dialogRes.canceled && dialogRes.filePath) {
          const writeRes = await db.backup.writeExportFile(dialogRes.filePath, backupData);
          if (writeRes.success) {
            toast.success(`Backup saved successfully to ${dialogRes.filePath}`);
            return;
          }
        } else {
          return; // User cancelled
        }
      }

      // Browser fallback download
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Database backup downloaded successfully!');
    } catch (e: any) {
      console.error(e);
      toast.error(`Backup failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      toast.info('Validating and restoring database backup...');

      const content = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        toast.error('Invalid backup file: Not valid JSON.');
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        toast.error('Invalid backup file structure.');
        return;
      }

      if ((window as any).api?.db?.backup?.restore) {
        await db.backup.restoreBackup(parsed);
      }

      toast.success('Database restored successfully! Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      toast.error(`Restore failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
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
              <CardTitle className="text-card-foreground flex items-center justify-between">
                <span>Application Updates</span>
                {updateState === 'ready' && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold">
                    v{updateInfo?.version || 'New'} Ready to Install
                  </span>
                )}
                {updateState === 'downloading' && (
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Downloading {updateProgress}%
                  </span>
                )}
              </CardTitle>
              <CardDescription>Check for newer versions of Sara Gaming Zone Management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {updateState === 'downloading' && (
                <div className="p-3.5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-indigo-200 font-medium">Downloading update v{updateInfo?.version || ''}...</span>
                    <span className="font-mono text-indigo-300 font-bold">{updateProgress}%</span>
                  </div>
                  <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden border border-white/5">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-300 ease-out"
                      style={{ width: `${updateProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {updateState === 'ready' && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-300">Update v{updateInfo?.version} is Downloaded</h4>
                    <p className="text-xs text-emerald-400/80 mt-0.5">Click below to restart the app and apply the update now.</p>
                  </div>
                  <Button
                    disabled={isInstallingUpdate}
                    onClick={async () => {
                      setIsInstallingUpdate(true);
                      try {
                        await updater.installUpdate();
                      } catch (e) {
                        console.error('Failed to trigger update restart', e);
                        setIsInstallingUpdate(false);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isInstallingUpdate ? 'animate-spin' : ''}`} />
                    {isInstallingUpdate ? 'Restarting...' : 'Restart & Install Now'}
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={checkingUpdate || updateState === 'downloading' || isInstallingUpdate}
                  className="border-white/10 bg-white/5 hover:bg-white/10 gap-2"
                  onClick={async () => {
                    setCheckingUpdate(true);
                    toast.dismiss();
                    toast.info('Checking for updates...');
                    try {
                      if ((window as any).api?.updater) {
                        const res = await updater.checkForUpdates();
                        if (res?.status === 'dev_mode') {
                          toast.dismiss();
                          toast.info(res.message);
                          setCheckingUpdate(false);
                        } else if (res?.status === 'error') {
                          toast.dismiss();
                          const errMsg = res.message || '';
                          if (errMsg.includes('404') || errMsg.includes('Cannot find') || errMsg.includes('releases.atom')) {
                            toast.success('Sara Gaming Zone is up to date!');
                          } else {
                            toast.error(`Update check: ${errMsg}`);
                          }
                          setCheckingUpdate(false);
                        }
                      } else {
                        setTimeout(() => {
                          toast.dismiss();
                          toast.info('Automatic update check is active in packaged desktop builds.');
                          setCheckingUpdate(false);
                        }, 1000);
                      }
                    } catch (e: any) {
                      toast.dismiss();
                      const errMsg = e?.message || '';
                      if (errMsg.includes('404') || errMsg.includes('Cannot find') || errMsg.includes('releases.atom')) {
                        toast.success('Sara Gaming Zone is up to date!');
                      } else {
                        toast.error(errMsg || 'Failed to check for updates');
                      }
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
              </div>

              <p className="text-xs text-muted-foreground">
                Updates are downloaded automatically in the background. A restart button will appear here once download finishes.
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
                  <Label>Currency Symbol / Text</Label>
                  <div className="flex gap-2 mb-1.5">
                    {['₹', 'INR', '$', '€'].map(symbol => (
                      <button
                        key={symbol}
                        type="button"
                        onClick={() => setFormData({...formData, currency_symbol: symbol})}
                        className={`px-2.5 py-1 text-xs rounded-md border font-mono transition-all ${
                          formData.currency_symbol === symbol 
                            ? 'bg-indigo-600 border-indigo-500 text-white font-bold' 
                            : 'bg-black/30 border-white/10 text-muted-foreground hover:bg-white/10'
                        }`}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                  <Input 
                    value={formData.currency_symbol} 
                    onChange={(e) => setFormData({...formData, currency_symbol: e.target.value})}
                    placeholder="e.g. INR or ₹"
                    className="border-white/10 bg-background/50 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Select preset or enter custom currency representation (e.g., INR or ₹).</p>
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
        <TabsContent value="pricing" className="space-y-6">
          <PricingManager />
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
                <CardDescription>Link your admin WhatsApp account for sending automated invoices, reminders, and alerts.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={waActionLoading}
                  className="border-white/10 gap-2 shrink-0 hover:bg-white/5"
                  onClick={handleWaReconnect}
                >
                  {waActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reconnect
                </Button>
                {waStatus.ready && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={waActionLoading}
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2 shrink-0"
                    onClick={handleWaDisconnect}
                  >
                    <PowerOff className="w-4 h-4" /> Disconnect
                  </Button>
                )}
                {(waStatus.ready || (waStatus as any).state === 'disconnected' || (waStatus as any).state === 'error' || (waStatus as any).state === 'auth_failure') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={waActionLoading}
                    className="gap-2 shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
                    onClick={handleWaLogout}
                  >
                    <LogOut className="w-4 h-4" /> Logout / Switch
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center justify-center p-8">
              {waStatus.ready ? (
                <div className="w-full max-w-lg flex flex-col items-center text-center gap-4 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 shadow-xl">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-background rounded-full animate-ping" />
                    <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-background rounded-full" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-bold text-emerald-300">WhatsApp is Connected & Active</h3>
                    <p className="text-xs text-emerald-400/80 mt-1">
                      Invoices, session reminders, review requests and loyalty alerts will be sent automatically.
                    </p>
                  </div>

                  {(waStatus as any).account && (
                    <div className="w-full grid grid-cols-2 gap-3 pt-3 mt-1 border-t border-emerald-500/15 text-left text-xs">
                      <div className="bg-background/40 p-2.5 rounded-lg border border-white/5">
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Linked Phone</span>
                        <span className="font-mono text-foreground font-medium flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-indigo-400" />
                          +{(waStatus as any).account.phone || 'Unknown'}
                        </span>
                      </div>
                      <div className="bg-background/40 p-2.5 rounded-lg border border-white/5">
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Account / Device</span>
                        <span className="text-foreground font-medium truncate flex items-center gap-1.5 mt-0.5">
                          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                          {(waStatus as any).account.name || (waStatus as any).account.platform || 'WhatsApp Web'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaReconnect}
                      className="border-white/10 text-xs gap-1.5 hover:bg-white/5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh Session
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaDisconnect}
                      className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs gap-1.5"
                    >
                      <PowerOff className="w-3.5 h-3.5" /> Pause / Disconnect
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaLogout}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Unlink Account
                    </Button>
                  </div>
                </div>
              ) : waStatus.qr ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="bg-white p-4 rounded-2xl shadow-2xl border-4 border-indigo-500/30">
                    <QRCodeCanvas value={waStatus.qr} size={256} />
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-sm text-indigo-300 font-semibold animate-pulse block">Waiting for scan — open WhatsApp on your phone</span>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      WhatsApp → Menu (⋮) or Settings → Linked Devices → Link a Device
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={waActionLoading}
                    onClick={handleWaReconnect}
                    className="border-white/10 text-xs gap-1.5 mt-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Generate Fresh QR
                  </Button>
                </div>
              ) : (waStatus as any).state === 'auth_failure' ? (
                <div className="flex flex-col items-center text-red-400 gap-3 py-8 max-w-md text-center">
                  <AlertCircle className="w-12 h-12" />
                  <span className="font-bold text-lg">Authentication Failed</span>
                  <p className="text-sm text-red-400/80">Your linked WhatsApp session was rejected or expired. Please re-authenticate.</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={waActionLoading}
                    onClick={handleWaLogout}
                    className="mt-2 gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Reset & Scan QR
                  </Button>
                </div>
              ) : (waStatus as any).state === 'disconnected' ? (
                <div className="flex flex-col items-center text-amber-400 gap-3 py-8 max-w-md text-center">
                  <PowerOff className="w-12 h-12" />
                  <span className="font-bold text-lg">WhatsApp Disconnected</span>
                  <p className="text-sm text-amber-400/80">
                    {(waStatus as any).initError || 'Connection lost or paused. Automated messages are temporarily queued.'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaReconnect}
                      className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Reconnect Now
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaLogout}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 gap-2"
                    >
                      <LogOut className="w-4 h-4" /> Reset & Link New Phone
                    </Button>
                  </div>
                </div>
              ) : (waStatus as any).state === 'error' ? (
                <div className="flex flex-col items-center text-red-400 gap-3 py-8 max-w-md text-center">
                  <AlertCircle className="w-12 h-12" />
                  <span className="font-bold text-lg">WhatsApp Service Error</span>
                  <p className="text-sm text-red-400/80">{(waStatus as any).initError || 'The WhatsApp browser process encountered an issue.'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaReconnect}
                      className="border-red-500/30 text-red-300 hover:bg-red-500/10 gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry Connection
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={waActionLoading}
                      onClick={handleWaLogout}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 gap-2"
                    >
                      <LogOut className="w-4 h-4" /> Clean Reset
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-muted-foreground gap-3 py-8">
                  <div className="w-12 h-12 border-4 border-muted-foreground/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="font-medium">
                    {(waStatus as any).state === 'authenticated' ? 'Loading your linked account…' : 'Starting WhatsApp browser…'}
                  </span>
                  <p className="text-xs text-muted-foreground/50">This can take 15–45 seconds on launch.</p>
                  {(waStatus as any).elapsedMs > 60000 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleWaReconnect}
                      className="border-white/10 text-xs gap-1.5 mt-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Restart Process
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-card-foreground">Session Reminder & Message Intervals</CardTitle>
              <CardDescription>Customize when automated WhatsApp reminders and warnings are sent to players.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div>
                  <Label className="text-base">Enable WhatsApp Session Reminders</Label>
                  <p className="text-xs text-muted-foreground mt-1">Automatically send WhatsApp warnings to customers before their session time ends.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.whatsapp_session_reminders_enabled}
                    onChange={(e) => setFormData({...formData, whatsapp_session_reminders_enabled: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${formData.whatsapp_session_reminders_enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div className="space-y-2">
                  <Label>Primary Warning Interval (Minutes before end)</Label>
                  <Input 
                    type="number" min="1" max="60"
                    value={formData.session_reminder_mins_1} 
                    onChange={(e) => setFormData({...formData, session_reminder_mins_1: e.target.value})}
                    placeholder="e.g. 15"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">First WhatsApp reminder sent (e.g. 15 minutes before session time is up).</p>
                </div>

                <div className="space-y-2">
                  <Label>Secondary Warning Interval (Minutes before end)</Label>
                  <Input 
                    type="number" min="0" max="30"
                    value={formData.session_reminder_mins_2} 
                    onChange={(e) => setFormData({...formData, session_reminder_mins_2: e.target.value})}
                    placeholder="e.g. 5"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Final warning sent before session end (e.g. 5 minutes left). Set to 0 to disable.</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div>
                  <Label className="text-base">Send "Time Is Up" WhatsApp Message</Label>
                  <p className="text-xs text-muted-foreground mt-1">Notify player via WhatsApp when their session duration reaches 0 minutes.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.session_reminder_end_enabled}
                    onChange={(e) => setFormData({...formData, session_reminder_end_enabled: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Outbound Queue Delay (Seconds)</Label>
                  <Input 
                    type="number" min="1" max="60"
                    value={formData.wa_queue_cooldown_sec} 
                    onChange={(e) => setFormData({...formData, wa_queue_cooldown_sec: e.target.value})}
                    placeholder="e.g. 5"
                    className="border-white/10 bg-background/50"
                  />
                  <p className="text-[10px] text-muted-foreground">Spacing delay between sending queued WhatsApp messages to ensure account safety.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-indigo-400" /> Custom WhatsApp Message Templates
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize automatic reminder texts. Supported placeholders: <code className="text-indigo-300 font-mono">{'{name}'}</code>, <code className="text-indigo-300 font-mono">{'{station}'}</code>, <code className="text-indigo-300 font-mono">{'{time}'}</code></p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Primary Warning Template (e.g. 15 Mins Left)</Label>
                    <Input
                      value={formData.wa_template_warning_1}
                      onChange={(e) => setFormData({...formData, wa_template_warning_1: e.target.value})}
                      className="border-white/10 bg-background/50 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Final Warning Template (e.g. 5 Mins Left)</Label>
                    <Input
                      value={formData.wa_template_warning_2}
                      onChange={(e) => setFormData({...formData, wa_template_warning_2: e.target.value})}
                      className="border-white/10 bg-background/50 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Time Is Up Template</Label>
                    <Input
                      value={formData.wa_template_end}
                      onChange={(e) => setFormData({...formData, wa_template_end: e.target.value})}
                      className="border-white/10 bg-background/50 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
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
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
              <div>
                <CardTitle className="text-card-foreground">WhatsApp Outbound Queue</CardTitle>
                <CardDescription>Monitor and manage pending messages. Failing messages drop automatically after 3 retries.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {waQueue.some(item => item.status === 'failed') && (
                  <Button onClick={handleClearFailedQueue} variant="outline" size="sm" className="bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border-purple-500/20 text-xs">
                    Clear Failed ({waQueue.filter(item => item.status === 'failed').length})
                  </Button>
                )}
                <Button onClick={handleClearQueue} variant="destructive" size="sm" className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20 text-xs">
                  Clear Entire Queue
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* If there are pending items and client is disconnected or had detached frame */}
              {((waStatus as any).state === 'disconnected' || (waStatus as any).state === 'error' || waQueue.some(i => (i.errorCategory || '').includes('Browser Frame Disconnected') || (i.error || '').includes('detached Frame'))) && (
                <div className="mb-4 p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-300">WhatsApp Engine Needs Reconnection</h4>
                      <p className="text-[11px] text-amber-200/80">
                        Browser frame or background session paused. Click below to instantly restart the engine and flush pending messages.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={waActionLoading}
                    onClick={handleWaReconnect}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${waActionLoading ? 'animate-spin' : ''}`} />
                    Auto-Fix & Flush Queue
                  </Button>
                </div>
              )}

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
                          {/* Status badges */}
                          {item.status === 'sent' && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              ✓ Sent
                            </span>
                          )}
                          {item.status === 'failed' && (item.errorCategory === 'Invalid Number' || item.errorCategory === 'Not a 10-Digit Mobile') && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              🚫 Not on WhatsApp
                            </span>
                          )}
                          {item.status === 'failed' && item.errorCategory === 'Invalid Phone Format' && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              ⚠️ Invalid 10-Digit Number
                            </span>
                          )}
                          {item.status === 'failed' && !['Invalid Number', 'Not a 10-Digit Mobile', 'Invalid Phone Format'].includes(item.errorCategory || '') && (
                            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              ✗ Failed {item.errorCategory ? `(${item.errorCategory})` : ''}
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-bold animate-pulse flex items-center gap-1">
                              ⏳ Pending
                            </span>
                          )}
                          {item.permanent && !['Invalid Number', 'Not a 10-Digit Mobile', 'Invalid Phone Format'].includes(item.errorCategory || '') && (
                            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-bold">
                              Permanent Failure
                            </span>
                          )}
                          {(item.retryCount || 0) > 0 && !item.permanent && item.status !== 'failed' && (
                            <span className="flex items-center gap-1 text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-bold">
                              <AlertCircle className="w-3 h-3" /> Retry {item.retryCount}/3
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[400px]">{item.message}</p>
                        {item.pdfName && <p className="text-[10px] text-indigo-400 mt-1">📎 {item.pdfName}</p>}
                        
                        {/* Friendly Error Explanations */}
                        {(item.error || item.lastError) && (
                          <div className={`text-[11px] mt-1.5 p-2 rounded-lg border flex items-start gap-1.5 max-w-[550px] ${
                            item.errorCategory === 'Invalid Number' || item.errorCategory === 'Not a 10-Digit Mobile'
                              ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
                              : item.errorCategory === 'Invalid Phone Format'
                              ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                              : 'bg-red-950/30 border-red-800/30 text-red-400/90'
                          }`}>
                            <span className="text-sm shrink-0">
                              {item.errorCategory === 'Invalid Number' || item.errorCategory === 'Not a 10-Digit Mobile' ? '🚫' : item.errorCategory === 'Invalid Phone Format' ? '📱' : '⚠️'}
                            </span>
                            <div>
                              <div className="font-semibold text-xs mb-0.5">
                                {item.errorCategory === 'Invalid Number' || item.errorCategory === 'Not a 10-Digit Mobile'
                                  ? 'Number Not Found on WhatsApp'
                                  : item.errorCategory === 'Invalid Phone Format'
                                  ? 'Invalid Indian Phone Number'
                                  : item.errorCategory || 'Send Error'}
                              </div>
                              <div className="text-[11px] opacity-90 leading-relaxed font-sans">
                                {item.errorCategory === 'Invalid Number' || item.errorCategory === 'Not a 10-Digit Mobile'
                                  ? 'This phone number is valid in length but has no active WhatsApp account associated with it.'
                                  : item.errorCategory === 'Invalid Phone Format'
                                  ? 'The entered phone number is missing digits or invalid. Indian mobile numbers must be 10 digits starting with 6, 7, 8, or 9.'
                                  : `Reason: ${item.error || item.lastError}`}
                              </div>
                            </div>
                          </div>
                        )}
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

      {/* Danger Zone: Data Reset & System Wipe */}
      <Card className="bg-red-950/20 backdrop-blur-md border-red-500/30 mt-8">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" /> Danger Zone & System Reset
          </CardTitle>
          <CardDescription className="text-xs text-red-400/70">
            Permanently clear sessions, revenue reports, or customer directories. Password verification required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-red-500/20 bg-black/40 space-y-2">
              <h4 className="font-bold text-sm text-foreground">Reset Session & Report Data</h4>
              <p className="text-[11px] text-muted-foreground">Deletes all past gaming sessions, sales logs, and financial reports while preserving customer profiles & stations.</p>
              <Button 
                onClick={() => setConfirmModal({
                  open: true,
                  title: 'Wipe Session & Report History',
                  description: 'This will permanently remove all revenue, sales logs, and session history from reports.',
                  onConfirm: async () => {
                    await db.sessions.clear();
                    toast.success('All reports and session records have been wiped successfully.');
                  }
                })}
                variant="outline" 
                className="w-full text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 mt-2"
              >
                Clear Reports & Sessions
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-red-500/20 bg-black/40 space-y-2">
              <h4 className="font-bold text-sm text-foreground">Reset Customer Directory</h4>
              <p className="text-[11px] text-muted-foreground">Deletes all saved customer accounts, wallet balances, and accumulated loyalty points.</p>
              <Button 
                onClick={() => setConfirmModal({
                  open: true,
                  title: 'Wipe Customer Database',
                  description: 'This will delete all saved customer accounts, phone records, and wallet balances.',
                  onConfirm: async () => {
                    await db.customers.clear();
                    toast.success('Customer directory cleared successfully.');
                  }
                })}
                variant="outline" 
                className="w-full text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 mt-2"
              >
                Clear Customer Data
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2">
              <h4 className="font-bold text-sm text-red-400">Full System Reset (Factory Wipe)</h4>
              <p className="text-[11px] text-red-300/80">Wipes all data including sessions, customer directory, custom menu items, and food stock to factory state.</p>
              <Button 
                onClick={() => setConfirmModal({
                  open: true,
                  title: 'Perform Full Factory Reset',
                  description: 'CRITICAL: This will completely reset the database to factory settings.',
                  onConfirm: async () => {
                    await Promise.all([
                      db.sessions.clear(),
                      db.customers.clear(),
                      db.menu.clear(),
                      db.whatsappQueue.clear()
                    ]);
                    toast.success('Full system reset completed successfully.');
                    window.location.reload();
                  }
                })}
                className="w-full text-xs bg-red-600 hover:bg-red-700 text-white font-bold mt-2"
              >
                Factory Reset All Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PricingRuleModal 
        rule={editingRule} 
        isOpen={isRuleModalOpen} 
        onClose={() => setIsRuleModalOpen(false)} 
        onSave={loadSettings} 
      />

      <ConfirmPasswordModal
        open={confirmModal.open}
        title={confirmModal.title}
        description={confirmModal.description}
        correctPassword={formData.admin_password || 'admin'}
        onClose={() => setConfirmModal(prev => ({ ...prev, open: false }))}
        onConfirm={confirmModal.onConfirm}
      />

      <div className="pt-8 text-center">
        <a href="https://www.brandex.co.in" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground/60 hover:text-indigo-400 transition-colors">
          Built by Brandex
        </a>
      </div>
    </div>
  );
}
