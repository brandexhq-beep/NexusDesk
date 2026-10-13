import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { Customer, Station, Session, Game } from '../types';
import { Search, Calendar, History, Gamepad2, FileSpreadsheet, RefreshCw, Banknote, QrCode, Wallet, Split, CreditCard } from 'lucide-react';
import { exportToCSV } from '../lib/csvExport';
import { fuzzySearch } from '../lib/search';
import { SessionDetailsModal } from '../components/SessionDetailsModal';
import { EditPaymentModal } from '../components/EditPaymentModal';

export function Reports() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  
  const [topCustomers, setTopCustomers] = useState<Customer[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [paymentBreakdownData, setPaymentBreakdownData] = useState<any[]>([]);
  const [popularGames, setPopularGames] = useState<any[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [cafeName, setCafeName] = useState('Gaming Cafe');

  // Filter States
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Metrics
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [cashRevenue, setCashRevenue] = useState(0);
  const [upiRevenue, setUpiRevenue] = useState(0);
  const [walletRevenue, setWalletRevenue] = useState(0);
  const [gamingRevenue, setGamingRevenue] = useState(0);
  const [foodRevenue, setFoodRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  // Selected session details modal
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [editPaymentSession, setEditPaymentSession] = useState<Session | null>(null);

  const [expensesList, setExpensesList] = useState<any[]>([]);

  useEffect(() => {
    // Set default dates
    const now = new Date();
    const firstDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setStartDateStr(firstDayStr);
    setEndDateStr(todayStr);

    loadAllData();
  }, []);

  const loadAllData = async () => {
    const [custs, stns, sess, gms, set, exps] = await Promise.all([
      db.customers.getAll(),
      db.stations.getAll(),
      db.sessions.getAll(),
      db.games.getAll(),
      db.settings.get(),
      db.expenses.getAll()
    ]);

    setCustomers(custs);
    setStations(stns);
    setSessions(sess);
    setGames(gms);
    setExpensesList(exps || []);
    setCurrency(set.currency_symbol || '₹');
    setCafeName(set.cafe_name || 'Gaming Cafe');

    // Sort top customers by loyalty points
    const sortedCusts = [...custs].sort((a, b) => b.loyalty_points - a.loyalty_points).slice(0, 5);
    setTopCustomers(sortedCusts);
  };

  // Helper date range calculation
  const getDateRange = () => {
    const now = new Date();
    let startMs = 0;
    let endMs = now.getTime();

    if (dateFilterType === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startMs = todayStart.getTime();
    } else if (dateFilterType === 'yesterday') {
      const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      startMs = yestStart.getTime();
      endMs = yestEnd.getTime();
    } else if (dateFilterType === 'week') {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startMs = weekStart.getTime();
    } else if (dateFilterType === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      startMs = monthStart.getTime();
    } else if (dateFilterType === 'custom' && startDateStr && endDateStr) {
      const s = new Date(startDateStr);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDateStr);
      e.setHours(23, 59, 59, 999);
      startMs = s.getTime();
      endMs = e.getTime();
    }

    return { startMs, endMs };
  };

  // Process data whenever filters or sessions change
  useEffect(() => {
    const { startMs, endMs } = getDateRange();

    let filtered = sessions.filter(s => {
      const sTime = s.end_time ? Number(s.end_time) : Number(s.start_time);
      return sTime >= startMs && sTime <= endMs;
    });

    if (selectedStationFilter !== 'all') {
      filtered = filtered.filter(s => s.station_id === selectedStationFilter);
    }

    if (selectedPaymentFilter !== 'all') {
      filtered = filtered.filter(s => {
        const mode = s.payment_mode || 'cash';
        if (selectedPaymentFilter === 'cash') return mode === 'cash' || Boolean(s.cash_amount && s.cash_amount > 0);
        if (selectedPaymentFilter === 'upi') return mode === 'upi' || Boolean(s.upi_amount && s.upi_amount > 0);
        if (selectedPaymentFilter === 'wallet') return mode === 'wallet' || Boolean(s.wallet_amount && s.wallet_amount > 0);
        if (selectedPaymentFilter === 'mixed') return mode === 'mixed';
        return true;
      });
    }

    let totRev = 0;
    let totCash = 0;
    let totUpi = 0;
    let totWallet = 0;
    let gamRev = 0;
    let fdRev = 0;
    let count = 0;

    const gameCounts: Record<string, number> = {};

    const formatDateKey = (d: Date) => 
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dateMap: Record<string, { gaming: number; food: number; cash: number; upi: number }> = {};

    filtered.forEach(s => {
      if (s.status === 'completed') {
        count++;
        const amt = s.total_amount || 0;
        totRev += amt;

        // Separate cash and upi amounts
        let cAmt = 0;
        let uAmt = 0;
        let wAmt = 0;

        if (s.cash_amount !== undefined || s.upi_amount !== undefined || s.wallet_amount !== undefined) {
          cAmt = s.cash_amount || 0;
          uAmt = s.upi_amount || 0;
          wAmt = s.wallet_amount || 0;
        } else if (s.payment_mode === 'upi') {
          uAmt = amt;
        } else if (s.payment_mode === 'wallet') {
          wAmt = amt;
        } else {
          cAmt = amt;
        }

        totCash += cAmt;
        totUpi += uAmt;
        totWallet += wAmt;

        const foodCost = s.orders ? s.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0) : 0;
        const gCost = Math.max(0, amt - foodCost);

        fdRev += foodCost;
        gamRev += gCost;

        const sDate = new Date(s.end_time ? Number(s.end_time) : Number(s.start_time));
        const dKey = formatDateKey(sDate);

        if (!dateMap[dKey]) {
          dateMap[dKey] = { gaming: 0, food: 0, cash: 0, upi: 0 };
        }
        dateMap[dKey].gaming += gCost;
        dateMap[dKey].food += foodCost;
        dateMap[dKey].cash += cAmt;
        dateMap[dKey].upi += uAmt;

        if (s.game_ids && Array.isArray(s.game_ids)) {
          s.game_ids.forEach(id => {
            gameCounts[id] = (gameCounts[id] || 0) + 1;
          });
        }
      }
    });

    setTotalRevenue(totRev);
    setCashRevenue(totCash);
    setUpiRevenue(totUpi);
    setWalletRevenue(totWallet);
    setGamingRevenue(gamRev);
    setFoodRevenue(fdRev);
    setSessionCount(count);

    // Build timeline chart data
    const chartData = Object.entries(dateMap).map(([dKey, val]) => {
      const d = new Date(dKey);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        name: `${days[d.getDay()]} (${d.getDate()}/${d.getMonth()+1})`,
        dateKey: dKey,
        gaming: val.gaming,
        food: val.food,
        cash: val.cash,
        upi: val.upi,
        total: val.gaming + val.food
      };
    }).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    setRevenueData(chartData);

    // Build payment breakdown chart data
    setPaymentBreakdownData([
      { name: 'Cash', value: totCash, color: '#10b981' },
      { name: 'UPI / Online', value: totUpi, color: '#6366f1' },
      { name: 'Wallet', value: totWallet, color: '#a855f7' }
    ].filter(item => item.value > 0));

    const popular = Object.entries(gameCounts)
      .map(([id, c]) => {
        const game = games.find(g => g.id === id);
        return { name: game ? game.name : 'Unknown', count: c };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setPopularGames(popular);

    // Calculate total expenses in date range
    const filteredExpenses = expensesList.filter(e => {
      const eTime = Number(e.timestamp);
      return eTime >= startMs && eTime <= endMs;
    });
    const expTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    setTotalExpenses(expTotal);

  }, [sessions, dateFilterType, startDateStr, endDateStr, selectedStationFilter, selectedPaymentFilter, games, expensesList]);

  // Filter sessions table
  const { startMs: rangeStart, endMs: rangeEnd } = getDateRange();
  const dateFilteredSessions: Session[] = sessions.filter(s => {
    const sTime = s.end_time ? Number(s.end_time) : Number(s.start_time);
    const inRange = sTime >= rangeStart && sTime <= rangeEnd;
    const matchStation = selectedStationFilter === 'all' || s.station_id === selectedStationFilter;
    const mode = s.payment_mode || 'cash';
    let matchPayment = true;
    if (selectedPaymentFilter === 'cash') matchPayment = mode === 'cash' || Boolean(s.cash_amount && s.cash_amount > 0);
    if (selectedPaymentFilter === 'upi') matchPayment = mode === 'upi' || Boolean(s.upi_amount && s.upi_amount > 0);
    if (selectedPaymentFilter === 'wallet') matchPayment = mode === 'wallet' || Boolean(s.wallet_amount && s.wallet_amount > 0);
    if (selectedPaymentFilter === 'mixed') matchPayment = mode === 'mixed';
    return inRange && matchStation && matchPayment;
  });

  const searchedSessions: Session[] = searchQuery.trim() === ''
    ? dateFilteredSessions
    : fuzzySearch(dateFilteredSessions, searchQuery, (s: Session) => {
        const cust = customers.find(c => c.id === s.customer_id);
        const stn = stations.find(st => st.id === s.station_id);
        const gNames = (s.game_ids || []).map(gid => games.find(g => g.id === gid)?.name || '').join(' ');
        return [cust?.name, cust?.phone, stn?.name, gNames, s.payment_mode];
      });

  const getStationName = (id?: string | null) => stations.find(s => s.id === id)?.name || 'Unknown Station';
  const getCustomerName = (id?: string | null) => customers.find(c => c.id === id)?.name || 'Walk-in Customer';
  const getGameNames = (ids?: string[] | null) => {
    if (!ids || ids.length === 0) return 'None';
    return ids.map(id => games.find(g => g.id === id)?.name || 'Unknown').join(', ');
  };

  const handleExportCustomCSV = () => {
    let rangeTitle = dateFilterType.toUpperCase();
    if (dateFilterType === 'custom') {
      rangeTitle = `${startDateStr} to ${endDateStr}`;
    }

    const headers = [
      'Session ID',
      'Date',
      'Start Time',
      'End Time',
      'Duration (Mins)',
      'Station Name',
      'Customer Name',
      'Customer Phone',
      'Games Played',
      'Number of Players',
      'Gaming Amount',
      'Food Amount',
      'Total Amount',
      'Payment Mode',
      'Cash Amount',
      'UPI Amount',
      'Wallet Amount',
      'Status'
    ];

    const rows = searchedSessions.map((s: Session) => {
      const startD = new Date(s.start_time);
      const endD = s.end_time ? new Date(s.end_time) : new Date();
      const mins = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 60000));
      const cust = customers.find(c => c.id === s.customer_id);
      const stn = stations.find(st => st.id === s.station_id);
      const gNames = (s.game_ids || []).map(gid => games.find(g => g.id === gid)?.name || 'Unknown').join('; ');
      
      const foodAmt = s.orders ? s.orders.reduce((sum: number, o: any) => sum + (o.price_at_order * o.quantity), 0) : 0;
      const gameAmt = Math.max(0, (s.total_amount || 0) - foodAmt);

      const cAmt = s.cash_amount !== undefined ? s.cash_amount : (s.payment_mode === 'cash' || !s.payment_mode ? (s.total_amount || 0) : 0);
      const uAmt = s.upi_amount !== undefined ? s.upi_amount : (s.payment_mode === 'upi' ? (s.total_amount || 0) : 0);
      const wAmt = s.wallet_amount !== undefined ? s.wallet_amount : (s.payment_mode === 'wallet' ? (s.total_amount || 0) : 0);

      return [
        s.id,
        startD.toLocaleDateString(),
        startD.toLocaleTimeString(),
        endD.toLocaleTimeString(),
        mins,
        stn?.name || 'Unknown',
        cust?.name || 'Walk-in',
        cust?.phone || 'N/A',
        gNames,
        s.num_players || 1,
        gameAmt.toFixed(2),
        foodAmt.toFixed(2),
        (s.total_amount || 0).toFixed(2),
        (s.payment_mode || 'cash').toUpperCase(),
        cAmt.toFixed(2),
        uAmt.toFixed(2),
        wAmt.toFixed(2),
        s.status
      ];
    });

    exportToCSV({
      title: 'Gaming Cafe Sales & Station History Report',
      cafeName,
      dateRangeStr: rangeTitle,
      summaryMetrics: [
        { label: 'Total Gross Revenue', value: `${currency} ${totalRevenue.toFixed(2)}` },
        { label: 'Cash Collected', value: `${currency} ${cashRevenue.toFixed(2)}` },
        { label: 'UPI / Online Collected', value: `${currency} ${upiRevenue.toFixed(2)}` },
        { label: 'Wallet Redeemed', value: `${currency} ${walletRevenue.toFixed(2)}` },
        { label: 'Gaming Revenue', value: `${currency} ${gamingRevenue.toFixed(2)}` },
        { label: 'Food & Snacks Revenue', value: `${currency} ${foodRevenue.toFixed(2)}` },
        { label: 'Total Logged Expenses', value: `${currency} ${totalExpenses.toFixed(2)}` },
        { label: 'Net Profit', value: `${currency} ${(totalRevenue - totalExpenses).toFixed(2)}` },
        { label: 'Completed Sessions', value: sessionCount }
      ],
      headers,
      rows,
      filename: `Report_${cafeName.replace(/\s+/g, '_')}_${dateFilterType}_${Date.now()}.csv`
    });
  };

  const cashPercent = totalRevenue > 0 ? Math.round((cashRevenue / totalRevenue) * 100) : 0;
  const upiPercent = totalRevenue > 0 ? Math.round((upiRevenue / totalRevenue) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics & Station Reports</h1>
          <p className="text-xs text-muted-foreground mt-1">Detailed revenue, Cash vs UPI breakdown, station play history, and financial audit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAllData} className="border-border text-xs gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button onClick={handleExportCustomCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-md shadow-emerald-600/20">
            <FileSpreadsheet className="w-4 h-4" /> Download Rich CSV
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date Range:</span>
            </div>

            <Select value={dateFilterType} onValueChange={(val: any) => setDateFilterType(val)}>
              <SelectTrigger className="w-36 h-8 text-xs border-border bg-background">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Past 7 Days</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {dateFilterType === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="h-8 text-xs border-border bg-background w-32"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="h-8 text-xs border-border bg-background w-32"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Station Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Station:</span>
              <Select value={selectedStationFilter} onValueChange={setSelectedStationFilter}>
                <SelectTrigger className="w-40 h-8 text-xs border-border bg-background">
                  <SelectValue placeholder="All Stations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stations</SelectItem>
                  {stations.map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment:</span>
              <Select value={selectedPaymentFilter} onValueChange={setSelectedPaymentFilter}>
                <SelectTrigger className="w-36 h-8 text-xs border-border bg-background">
                  <SelectValue placeholder="All Modes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modes</SelectItem>
                  <SelectItem value="cash">Cash Only</SelectItem>
                  <SelectItem value="upi">UPI Only</SelectItem>
                  <SelectItem value="wallet">Wallet Only</SelectItem>
                  <SelectItem value="mixed">Split / Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards: Revenue, Cash, UPI, Net Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Revenue */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground">{currency} {totalRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-indigo-400 mt-1">{sessionCount} completed sessions</p>
          </CardContent>
        </Card>

        {/* Cash Collected */}
        <Card className="bg-card border-border relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Banknote className="w-16 h-16 text-emerald-400" />
          </div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" /> Cash Collected
              </CardTitle>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {cashPercent}%
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">{currency} {cashRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Physical cash payments</p>
          </CardContent>
        </Card>

        {/* UPI / Online Collected */}
        <Card className="bg-card border-border relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <QrCode className="w-16 h-16 text-indigo-400" />
          </div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5" /> UPI / Online
              </CardTitle>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {upiPercent}%
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-400">{currency} {upiRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-muted-foreground mt-1">GPay, PhonePe, Paytm, QR</p>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="bg-card border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black ${totalRevenue - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {currency} {(totalRevenue - totalExpenses).toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Minus {currency}{totalExpenses.toLocaleString()} expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Sub-metrics: Gaming, Food, Wallet */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-3.5 rounded-lg bg-card border border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Gaming Time Revenue</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{currency} {gamingRevenue.toLocaleString()}</div>
          </div>
          <Gamepad2 className="w-6 h-6 text-indigo-400 opacity-60" />
        </div>

        <div className="p-3.5 rounded-lg bg-card border border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Food & Drinks Revenue</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{currency} {foodRevenue.toLocaleString()}</div>
          </div>
          <span className="text-xl opacity-60">🍿</span>
        </div>

        <div className="p-3.5 rounded-lg bg-card border border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Customer Wallet Used</div>
            <div className="text-lg font-bold text-purple-400 mt-0.5">{currency} {walletRevenue.toLocaleString()}</div>
          </div>
          <Wallet className="w-6 h-6 text-purple-400 opacity-60" />
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Timeline */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Revenue & Payment Timeline</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="cash" fill="#10b981" name="Cash" />
                <Bar dataKey="upi" fill="#6366f1" name="UPI" />
                <Bar dataKey="food" fill="#f59e0b" name="Food/Snacks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Mode Ratio */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Payment Ratio (Cash vs UPI)</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex flex-col items-center justify-center">
            {paymentBreakdownData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payments recorded in period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => [`${currency} ${Number(val || 0).toLocaleString()}`, 'Amount']}
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Station Play History & Billing Log */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-card-foreground flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" /> Station Play History & Billing Log ({searchedSessions.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect each station session, exact Cash vs UPI split, customer details, and invoice history.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Fuzzy search player, station, games, payment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-border bg-background/50 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {searchedSessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No session play history matches the current date/station/payment filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent text-xs uppercase">
                  <TableHead className="text-muted-foreground">Date & Time</TableHead>
                  <TableHead className="text-muted-foreground">Station</TableHead>
                  <TableHead className="text-muted-foreground">Customer / Player</TableHead>
                  <TableHead className="text-muted-foreground">Games Played</TableHead>
                  <TableHead className="text-muted-foreground text-center">Players</TableHead>
                  <TableHead className="text-muted-foreground text-right">Bill Amount</TableHead>
                  <TableHead className="text-muted-foreground">Payment Mode & Breakdown</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchedSessions.map((s: Session) => {
                  const startMs = new Date(s.start_time).getTime();
                  const endMs = s.end_time ? new Date(s.end_time).getTime() : Date.now();
                  const durationMins = Math.max(1, Math.round((new Date(endMs).getTime() - startMs) / 60000));

                  const totalAmt = s.total_amount || s.base_amount || 0;
                  const cAmt = s.cash_amount !== undefined ? s.cash_amount : (s.payment_mode === 'cash' || !s.payment_mode ? totalAmt : 0);
                  const uAmt = s.upi_amount !== undefined ? s.upi_amount : (s.payment_mode === 'upi' ? totalAmt : 0);

                  return (
                    <TableRow key={s.id} className="border-border hover:bg-white/5 text-xs">
                      <TableCell className="font-medium">
                        <div>{new Date(s.start_time).toLocaleDateString()}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({durationMins} mins)
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">
                        {getStationName(s.station_id)}
                      </TableCell>
                      <TableCell className="font-medium text-indigo-300">
                        {getCustomerName(s.customer_id)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[160px] truncate">
                        <span className="flex items-center gap-1">
                          <Gamepad2 className="w-3 h-3 text-indigo-400 shrink-0" />
                          {getGameNames(s.game_ids)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold">
                        {s.num_players || 1}P
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-400 text-sm">
                        {currency} {totalAmt.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {s.payment_mode === 'mixed' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold w-fit flex items-center gap-1">
                              <Split className="w-3 h-3" /> Split Payment
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {currency}{cAmt} Cash + {currency}{uAmt} UPI
                            </span>
                          </div>
                        ) : s.payment_mode === 'upi' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold font-mono inline-flex items-center gap-1">
                            <QrCode className="w-3 h-3" /> UPI ({currency}{totalAmt.toFixed(2)})
                          </span>
                        ) : s.payment_mode === 'wallet' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-300 font-semibold font-mono inline-flex items-center gap-1">
                            <Wallet className="w-3 h-3" /> Wallet ({currency}{totalAmt.toFixed(2)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold font-mono inline-flex items-center gap-1">
                            <Banknote className="w-3 h-3" /> Cash ({currency}{totalAmt.toFixed(2)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditPaymentSession(s)}
                            className="h-7 px-2 text-[11px] border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                            title="Change or fix payment mode (Cash, UPI, Split)"
                          >
                            <CreditCard className="w-3 h-3 mr-1 text-amber-400" /> Edit Mode
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSession(s)}
                            className="h-7 px-2 text-[11px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                          >
                            View Bill
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Popular Games & Top Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Game Popularity Ranking</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Rank & Game Name</TableHead>
                  <TableHead className="text-muted-foreground text-right">Sessions Played</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popularGames.map((game, i) => (
                  <TableRow key={i} className="border-border hover:bg-muted/50 text-xs">
                    <TableCell className="font-medium text-foreground flex items-center gap-2">
                      <span className="text-xs bg-indigo-500/20 text-indigo-400 font-bold px-2 py-0.5 rounded-md">#{i+1}</span>
                      {game.name}
                    </TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold font-mono">{game.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Top Customer Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent text-xs">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground text-right">Loyalty Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map(c => (
                  <TableRow key={c.id} className="border-border hover:bg-muted/50 text-xs">
                    <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono">{c.phone}</TableCell>
                    <TableCell className="text-right text-amber-400 font-bold font-mono">{c.loyalty_points} Pts</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <SessionDetailsModal
        session={selectedSession}
        station={stations.find(st => st.id === (selectedSession ? selectedSession.station_id : ''))}
        onClose={() => setSelectedSession(null)}
        onEditPayment={(s) => setEditPaymentSession(s)}
      />

      <EditPaymentModal
        session={editPaymentSession}
        open={!!editPaymentSession}
        onClose={() => setEditPaymentSession(null)}
        onUpdated={() => loadAllData()}
      />
    </div>
  );
}
