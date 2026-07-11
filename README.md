# NexusDesk: Premium Gaming Cafe Management System

![Dashboard Preview](https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop) *(Placeholder Image)*

NexusDesk is a modern, white-label, Progressive Web Application (PWA) designed to seamlessly manage the day-to-day operations of Gaming Cafes, eSports Lounges, and Cyber Cafes. Built with a stunning glassmorphic UI, it provides operators with real-time station tracking, dynamic pricing, a robust loyalty system, and deep customer analytics.

## ✨ Key Features

- **Live Station Tracking**: Monitor PS5s, VR rigs, and PC setups in real-time. Instantly see which stations are free, occupied, or past their grace period.
- **Dynamic Pricing Engine**: Configure complex "Happy Hour" pricing rules that automatically trigger based on the time of day and the specific day of the week.
- **Prepaid & Postpaid Sessions**: Support both walk-in open tabs (pay at the end) and fixed-duration prepaid sessions.
- **Customer CRM & Profiles**: Track lifetime spend, visit history, and contact details for registered customers.
- **Loyalty Point System**: Automatically award configurable loyalty points for every top-up, which customers can redeem for sessions or snacks.
- **Persistent Local Database**: Built-in persistence using `localStorage` ensures that a refresh or power outage won't wipe out your live sessions.
- **White-Label Ready**: Easily swap the cafe name, currency symbol, and logo via the Settings page.

## 🛠️ Technology Stack

- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn/ui
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Storage**: Browser LocalStorage (Architected for drop-in Firebase/Firestore replacement)

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/nexusdesk-cafe.git
   cd nexusdesk-cafe
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the App:**
   Navigate to `http://localhost:5173` in your browser.

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build
```

This will generate a `dist` folder containing minified assets ready for deployment on Vercel, Netlify, or Firebase Hosting.

## 🎨 White-Labeling & Branding

NexusDesk is designed to be resold or adapted for multiple venues. To rebrand:
1. Open the application.
2. Navigate to the **Settings** tab.
3. Update the **Cafe Name** and paste a **Logo Image/GIF URL**.
4. Set the local **Currency Symbol** and **Tax Rate**.
5. Save changes. The entire UI will instantly update to reflect the new brand.

## 🗄️ Database Architecture

Currently, the application uses an asynchronous `db.ts` wrapper around `localStorage` to simulate network calls and persist data locally without needing a backend server. 

When you are ready to scale to multiple synchronized tablets:
1. Create a Firebase project.
2. Update the methods in `src/services/db.ts` to use Firestore's `getDocs`, `addDoc`, and `updateDoc`. 
3. The rest of the application UI will seamlessly accept the real database calls without requiring massive component rewrites.

---
*Built with ❤️ for cafe operators worldwide.*
