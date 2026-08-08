import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import type { AppSettings } from '../types';
import { AlertCircle } from 'lucide-react';

export function ReviewQueue() {
  const [errorCount, setErrorCount] = useState(0);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    db.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    const processQueue = async () => {
      if (!settings) return;
      
      const now = Date.now();
      const allRequests = await db.reviewRequests.getAll();
      const dueRequests = allRequests.filter(r => !r.sent && r.scheduled_for <= now);

      if (dueRequests.length === 0) {
        setErrorCount(0);
        return;
      }

      let failures = 0;

      for (const req of dueRequests) {
        try {
          const customer = await db.customers.getById(req.customer_id);
          if (!customer || !customer.phone) {
             await db.reviewRequests.markSent(req.id);
             continue;
          }

          const sessions = await db.sessions.getAll();
          const session = sessions.find(s => s.id === req.session_id);
          if (!session) {
             await db.reviewRequests.markSent(req.id);
             continue;
          }
          
          const stations = await db.stations.getAll();
          const station = stations.find(s => s.id === session.station_id);
          if (!station) {
             await db.reviewRequests.markSent(req.id);
             continue;
          }

          const googleReviewLink = settings.google_review_url || "https://g.page/r/YOUR_UNIQUE_LINK/review";
          const cafeName = settings.cafe_name || "us";
          const message = `Hi ${customer.name},\n\nHope you enjoyed your session at ${cafeName} today!\n\nIf you have a moment, we would love to hear your feedback. Please leave us a review on Google using the link below:\n${googleReviewLink}\n\nThank you again, and we look forward to seeing you soon!`;

          const response = await whatsapp.sendInvoice({ phone: customer.phone, message });

          if (response.ok) {
            await db.reviewRequests.markSent(req.id);
          } else {
            failures++;
          }
        } catch (err) {
          failures++;
        }
      }
      
      setErrorCount(failures);
    };

    processQueue();
    // Poll every 30 seconds
    const interval = setInterval(processQueue, 30000);
    return () => clearInterval(interval);
  }, [settings]);

  if (errorCount === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80">
      <div className="bg-red-500 text-white px-4 py-2 rounded-xl shadow-lg font-medium flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">WhatsApp Server Offline! {errorCount} messages pending. Start the local server to resume.</span>
      </div>
    </div>
  );
}
