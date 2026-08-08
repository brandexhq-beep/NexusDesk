# NexusDesk: Premium Gaming Cafe Management System

![NexusDesk Banner](public/logo.png) *(Brandex Gaming Cafe Tool)*

NexusDesk is a modern, white-label desktop and web application designed to manage the day-to-day operations of Gaming Cafes, eSports Lounges, and Cyber Cafes. Built with a glassmorphic dark-mode UI, it provides operators with live station tracking, dynamic pricing, a loyalty engine, food/drink orders, WhatsApp automated invoicing & review collection, and deep analytics.

---

## ✨ Key Features

- 🎮 **Live Station Dashboard**: Real-time tracking of PS5s, VR Rigs, Sim Racing setups, Snooker tables, and Gaming PCs.
- ⚡ **Dynamic Pricing Engine**: Configure "Happy Hour" rules based on days of the week, times of day, and overnight shifts (`start_time > end_time`).
- ⏱️ **Grace Period & Prepaid Support**: Custom free grace period before billing starts, plus support for fixed-duration prepaid sessions and open tabs.
- 🍔 **Food & Snack Orders**: Add food and beverage items directly to active station tabs with real-time bill calculation.
- 👥 **Customer CRM & Loyalty**: Track lifetime spend, package credits (`available_minutes`), loyalty points earned/redeemed, and tab debts (`amount_owed`).
- 💬 **WhatsApp Automated Invoicing**: Automatically queue and send PDF invoices and Google Review requests via WhatsApp 30 minutes after session checkout.
- 🛡️ **Desktop Executable (`.exe`)**: Built with Electron for full Windows desktop integration with auto-starting WhatsApp service.
- 🎨 **White-Label Customization**: Customize Cafe Name, Logo URL/GIF, Currency Symbol, Tax Rates, Session Start Delay, and Google Review URL from Settings.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Shadcn UI
- **Desktop Wrapper**: Electron 43, Electron Builder, Electron Updater
- **Automation Service**: Node.js Express, WhatsApp Web.js (`puppeteer`), `jsPDF`, `jspdf-autotable`
- **Build Tool**: Vite 8

---

## 🚀 Commands & Development Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/brandex/nexusdesk.git
   cd "Gaming Cafe Management"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

---

### Running the System Commands

#### 1. Start Web Application (Dev Mode)
Runs the Vite development web app on `http://localhost:5173`.
```bash
npm run dev
```

#### 2. Start Desktop Application (Electron Dev Mode)
Launches the Web App inside Electron along with the integrated background WhatsApp service concurrently.
```bash
npm run electron:dev
```

#### 4. Type Check & Linting
Verify TypeScript types and run static analysis:
```bash
# Type check
npx tsc --noEmit

# Oxlint code check
npm run lint
```

---

## 📦 Bundling into Windows Executable (`.exe`)

To package the application into a standalone Windows installer (`.exe`):

```bash
npm run electron:build
```

### Build Artifacts Output
After the build process completes, the output installer will be saved in the `build-dist/` directory:
- **Installer**: `build-dist/Gaming Cafe Management Setup 1.0.1.exe`
- **Unpacked App**: `build-dist/win-unpacked/`

When launched from the installer, the desktop executable automatically spawns the background SQLite database and WhatsApp service natively.

---

## 📱 WhatsApp Integration Setup

1. Launch the Electron app (`npm run electron:dev` or from the installed `.exe`).
2. Navigate to the **Settings** tab -> **WhatsApp** tab inside the app.
3. Open WhatsApp on your mobile phone -> **Linked Devices** -> **Link a Device**.
4. Scan the QR code rendered in the Settings page.
5. Once authenticated, checkout receipts, Google Review links, and manual messages will automatically be sent to customer phone numbers via WhatsApp.

---

## ⚙️ White-Label & Settings Configuration

1. Open the application and navigate to **Settings**.
2. **General**: Update Cafe Name, Logo URL/GIF, Currency Symbol, Session Start Delay, and **Google Review URL**.
3. **Dynamic Pricing**: Create or toggle Happy Hour rules with custom hourly rates and active day filters.
4. **Loyalty System**: Configure the points-to-currency discount conversion rate.
5. **Data Management**: Backup or restore your local database as a `.json` file at any time.

---

*Built with ❤️ by [Brandex](https://www.brandex.co.in).*
