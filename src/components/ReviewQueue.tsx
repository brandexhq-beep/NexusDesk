import { useEffect, useState } from 'react';
import { db, whatsapp } from '../services/db';
import type { AppSettings } from '../types';
const REVIEW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days between review requests per customer

export function ReviewQueue() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    db.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    const processQueue = async () => {
      if (!settings) return;

      // Skip if no review URL configured — don't spam with placeholder link
      const googleReviewLink = settings.google_review_url || '';
      if (!googleReviewLink || googleReviewLink.includes('YOUR_UNIQUE_LINK')) return;

      const now = Date.now();
      const allRequests = await db.reviewRequests.getAll();
      const dueRequests = allRequests.filter(r => !r.sent && r.scheduled_for <= now);

      if (dueRequests.length === 0) {
        return;
      }

      // Build a set of customer IDs that have already received a review request in the last 7 days
      const recentlySentCustomerIds = new Set(
        allRequests
          .filter(r => r.sent && r.created_at && (now - Number(r.created_at)) < REVIEW_COOLDOWN_MS)
          .map(r => r.customer_id)
      );

      let failures = 0;

      for (const req of dueRequests) {
        try {
          const customer = await db.customers.getById(req.customer_id);

          // No customer or phone → silently mark sent (never retry)
          if (!customer || !customer.phone) {
            await db.reviewRequests.markSent(req.id);
            continue;
          }

          // 7-day cooldown: customer already got a review request recently
          if (recentlySentCustomerIds.has(req.customer_id)) {
            await db.reviewRequests.markSent(req.id); // Mark done so it doesn't loop
            console.log(`[ReviewQueue] Skipping review for ${customer.name} — sent within last 7 days.`);
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

          const cafeName = settings.cafe_name || 'us';
          const message =
            `Hi ${customer.name}! 👋\n\n` +
            `Hope you had an amazing session at *${cafeName}* today! 🎮\n\n` +
            `We'd love to hear what you thought. A quick Google review would mean the world to us:\n` +
            `${googleReviewLink}\n\n` +
            `Thank you for playing with us! See you again soon. 🙌`;

          const response = await whatsapp.sendInvoice({ phone: customer.phone, message });

          if (response.success && !response.deduplicated) {
            await db.reviewRequests.markSent(req.id);
            // Mark this customer as "recently sent" so siblings in the same batch are skipped
            recentlySentCustomerIds.add(req.customer_id);
          } else if (response.deduplicated) {
            // Message suppressed by the dedup layer — mark sent so it doesn't loop
            await db.reviewRequests.markSent(req.id);
          } else {
            failures++;
          }
        } catch (err) {
          console.error('[ReviewQueue] Error processing request:', err);
          failures++;
        }
      }
    };

    processQueue();
    const interval = setInterval(processQueue, 30000);
    return () => clearInterval(interval);
  }, [settings]);

  // Silent queue processor — status is shown in the left sidebar WhatsApp widget
  return null;
}
