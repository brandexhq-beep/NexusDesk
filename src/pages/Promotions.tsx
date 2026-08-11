import { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Send, Plus, Users, XCircle, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { MessageTemplate, Customer } from '../types';
import { toast } from 'sonner';

// DND: 9 PM – 9 AM IST. Blasts scheduled in this window will auto-delay.
function getISTHour() {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000).getHours();
}
function isDNDNow() {
  const h = getISTHour();
  return h >= 21 || h < 9;
}
function estimatedMinutes(recipientCount: number) {
  // Backend uses 30–60s jitter per message
  return Math.ceil(recipientCount * 45 / 60); // ~45s average per message
}

export function Promotions() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [campaign, setCampaign] = useState({ name: '', templateId: '', scheduleMins: '0', imageBase64: '' });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const t = await db.templates.getAll();
    const c = await db.customers.getAll();
    setTemplates(t);
    setCustomers(c);
    loadJobs();
  };

  const loadJobs = async () => {
    try {
      const data = await db.whatsappPromotions.getAll();
      setJobs(data);
    } catch (e) {
      console.error('Failed to load jobs');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCampaign({ ...campaign, imageBase64: ev.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) {
      toast.error('Please fill all template fields');
      return;
    }
    await db.templates.add(newTemplate);
    setNewTemplate({ name: '', content: '' });
    toast.success('Template saved!');
    loadData();
  };

  const handleDeleteTemplate = async (id: string) => {
    await db.templates.delete(id);
    toast.success('Template deleted');
    loadData();
  };

  const handleScheduleCampaign = async () => {
    if (!campaign.name || !campaign.templateId) {
      toast.error('Please select a campaign name and template');
      return;
    }
    
    const template = templates.find(t => t.id === campaign.templateId);
    if (!template) return;

    const phones = customers.map(c => c.phone).filter(p => !!p);
    if (phones.length === 0) {
      toast.error('No valid customers found to message.');
      return;
    }

    const scheduledAt = Date.now() + (Number(campaign.scheduleMins) * 60000);

    try {
      await db.whatsappPromotions.add({
        id: crypto.randomUUID(),
        name: campaign.name,
        message: template.content,
        scheduledAt,
        recipients: phones,
        imageBase64: campaign.imageBase64 || null,
        status: 'scheduled'
      });
      
      toast.success(`Campaign scheduled for ${phones.length} customers!`);
      setCampaign({ name: '', templateId: '', scheduleMins: '0', imageBase64: '' });
      const fileInput = document.getElementById('promo-image') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      loadJobs();
    } catch (e) {
      toast.error('Failed to schedule campaign');
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await db.whatsappPromotions.delete(id);
      toast.success('Job deleted');
      loadJobs();
    } catch (e) {
      toast.error('Failed to delete job');
    }
  };

  const handleCancelJob = async (id: string) => {
    try {
      await db.whatsappPromotions.cancel(id);
      toast.success('Campaign cancelled — it will not be sent.');
      loadJobs();
    } catch (e) {
      toast.error('Failed to cancel campaign');
    }
  };

  // JobProgress component to encapsulate polling for a specific job's progress
  const JobProgress = ({ jobId, initialTotal }: { jobId: string, initialTotal: number }) => {
    const [progress, setProgress] = useState({ total: initialTotal, sent: 0, failed: 0 });

    useEffect(() => {
      const fetchProgress = async () => {
        try {
          const queue = await db.whatsappQueue.getAll();
          const jobItems = queue.filter((q: any) => q.campaignId === jobId);
          if (jobItems.length > 0) {
            const sent = jobItems.filter((q: any) => q.status === 'sent').length;
            const failed = jobItems.filter((q: any) => q.status === 'failed').length;
            setProgress({ total: initialTotal, sent, failed });
          }
        } catch(e) {}
      };
      fetchProgress();
      const interval = setInterval(fetchProgress, 5000);
      return () => clearInterval(interval);
    }, [jobId]);

    const percentage = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

    return (
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Sent: {progress.sent} | Failed: {progress.failed}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
          <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Promotions Center</h1>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-muted-foreground backdrop-blur-md">
          <Users className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium">{customers.length} Customers Available</span>
        </div>
      </div>

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-black/40 border border-white/5 mb-6">
          <TabsTrigger value="campaigns">Active Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Message Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle>Schedule New Blast</CardTitle>
              <CardDescription>Send a promotional message to all registered customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* DND Warning */}
              {isDNDNow() && (
                <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-300">Do-Not-Disturb Hours Active</p>
                    <p className="text-xs text-orange-300/70 mt-0.5">
                      It is currently between 9 PM – 9 AM IST. Promotional blasts scheduled now will automatically
                      wait until 9 AM before sending, to protect your customers and prevent WhatsApp bans.
                    </p>
                  </div>
                </div>
              )}

              {/* Anti-spam info */}
              <div className="flex items-start gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <ShieldCheck className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-indigo-300 font-medium">Anti-Ban Protection Active</p>
                  <p className="text-xs text-indigo-300/70 mt-0.5">
                    Messages are spaced 30–60 seconds apart with random jitter. Each customer receives at most
                    1 promotional message per day. Max 60 promo messages per hour globally.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input 
                    placeholder="e.g. Weekend Offer" 
                    value={campaign.name}
                    onChange={e => setCampaign({...campaign, name: e.target.value})}
                    className="bg-black/50 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select Template</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={campaign.templateId}
                    onChange={e => setCampaign({...campaign, templateId: e.target.value})}
                  >
                    <option value="">-- Choose Template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Delay (Minutes)</Label>
                  <Input 
                    type="number"
                    min="0"
                    placeholder="0 for immediate" 
                    value={campaign.scheduleMins}
                    onChange={e => setCampaign({...campaign, scheduleMins: e.target.value})}
                    className="bg-black/50 border-white/10"
                  />
                  <p className="text-[10px] text-muted-foreground">Delay before starting the blast.</p>
                </div>
                <div className="space-y-2">
                  <Label>Attach Image (Optional)</Label>
                  <Input 
                    type="file"
                    accept="image/*"
                    id="promo-image"
                    onChange={handleImageUpload}
                    className="bg-black/50 border-white/10 text-muted-foreground file:text-white"
                  />
                  <p className="text-[10px] text-muted-foreground">This image will be sent along with your message.</p>
                </div>
              </div>
              {/* Estimate */}
              {customers.filter(c => c.phone).length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-black/30 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {customers.filter(c => c.phone).length} recipients — estimated delivery time: ~{estimatedMinutes(customers.filter(c => c.phone).length)} minutes
                  </span>
                </div>
              )}
              <Button onClick={handleScheduleCampaign} className="w-full bg-indigo-600 hover:bg-indigo-700">
                <Send className="w-4 h-4 mr-2" /> Schedule Campaign
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle>Scheduled & Recent Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">No active or recent campaigns.</div>
              ) : (
                <div className="space-y-3">
                  {jobs.map(job => (
                    <div key={job.id} className="flex justify-between items-center p-4 border border-white/5 rounded-xl bg-black/20">
                      <div className="flex-1 mr-4">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-white flex items-center gap-2">
                            {job.name} 
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : job.status === 'processing' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 'bg-orange-500/20 text-orange-400'}`}>
                              {job.status}
                            </span>
                            {job.imageBase64 && <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] uppercase">Includes Image</span>}
                          </h4>
                          <p className="text-xs text-muted-foreground">Recipients: {job.recipients.length}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 mb-2">Scheduled for: {new Date(job.scheduledAt).toLocaleString()}</p>
                        
                        {/* Progress Bar (Only show if processing or completed) */}
                        {(job.status === 'processing' || job.status === 'completed') && (
                          <JobProgress jobId={job.id} initialTotal={job.recipients.length} />
                        )}
                        {job.status === 'completed' && job.estimatedMinutes && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Est. delivery: ~{job.estimatedMinutes} min total
                            {job.queuedCount && ` • ${job.queuedCount} queued`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {job.status === 'scheduled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            title="Cancel before it fires"
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Cancel
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => handleDeleteJob(job.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
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

        <TabsContent value="templates" className="space-y-6">
          <Card className="bg-black/40 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle>Create Template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input 
                  placeholder="e.g. Happy Hour" 
                  value={newTemplate.name}
                  onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                  className="bg-black/50 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Message Content</Label>
                <textarea 
                  placeholder="Type your WhatsApp message here..." 
                  value={newTemplate.content}
                  onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                  className="flex min-h-[100px] w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button onClick={handleCreateTemplate} className="w-full bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> Save Template
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <Card key={t.id} className="bg-black/40 backdrop-blur-md border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex justify-between items-start">
                    {t.name}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t.id)} className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
