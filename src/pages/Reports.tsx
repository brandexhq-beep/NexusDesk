import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../services/db';
import type { Customer, Station, Session, Game } from '../types';
import { Search, Calendar, History, Gamepad2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { exportToCSV } from '../lib/csvExport';
import { fuzzySearch } from '../lib/search';
import { SessionDetailsModal } from '../components/SessionDetailsModal';

export function Reports() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  
  const [topCustomers, setTopCustomers] = useState<Customer[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [utilizationData, setUtilizationData] = useState<any[]>([]);
  const [popularGames, setPopularGames] = useState<any[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [cafeName, setCafeName] = useState('Gaming Cafe');

  // Filter States
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('month');
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Metrics
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [gamingRevenue, setGamingRevenue] = useState(0);
  const [foodRevenue, setFoodRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  // Selected session details modal
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

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
    const [custs, stns, sess, gms, set] = await Promise.all([
      db.customers.getAll(),
      db.stations.getAll(),
      db.sessions.getAll(),
      db.games.getAll(),
      db.settings.get()
    ]);

    setCustomers(custs);
    setStations(stns);
    setSessions(sess);
    setGames(gms);
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

    let totRev = 0;
    let gamRev = 0;
    let fdRev = 0;
    let count = 0;

    const gameCounts: Record<string, number> = {};
    const hourCounts = Array(24).fill(0);

    const formatDateKey = (d: Date) => 
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const dateMap: Record<string, { gaming: number; food: number }> = {};

    filtered.forEach(s => {
      if (s.status === 'completed') {
        count++;
        const amt = s.total_amount || 0;
        totRev += amt;

        const foodCost = s.orders ? s.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0) : 0;
        const gCost = Math.max(0, amt - foodCost);

        fdRev += foodCost;
        gamRev += gCost;

        const sDate = new Date(Number(s.end_time || s.start_time));
        const dKey = formatDateKey(sDate);
        if (!dateMap[dKey]) dateMap[dKey] = { gaming: 0, food: 0 };
        dateMap[dKey].gaming += gCost;
        dateMap[dKey].food += foodCost;
      }

      if (s.game_ids) {
        s.game_ids.forEach(id => {
          gameCounts[id] = (gameCounts[id] || 0) + 1;
        });
      }

      if (s.start_time) {
        const hour = new Date(Number(s.start_time)).getHours();
        hourCounts[hour]++;
      }
    });

    setTotalRevenue(totRev);
    setGamingRevenue(gamRev);
    setFoodRevenue(fdRev);
    setSessionCount(count);

    // Build chart data
    const chartData = Object.entries(dateMap).map(([dKey, val]) => {
      const d = new Date(dKey);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return {
        name: `${days[d.getDay()]} (${d.getDate()}/${d.getMonth()+1})`,
        dateKey: dKey,
        gaming: val.gaming,
        food: val.food,
        total: val.gaming + val.food
      };
    }).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    setRevenueData(chartData);

    const popular = Object.entries(gameCounts)
      .map(([id, c]) => {
        const game = games.find(g => g.id === id);
        return { name: game ? game.name : 'Unknown', count: c };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setPopularGames(popular);

    const utilization = hourCounts.map((c, i) => {
      const ampm = i >= 12 ? 'pm' : 'am';
      const hour12 = i % 12 || 12;
      return { time: `${hour12}${ampm}`, sessions: c };
    }).filter(d => d.sessions > 0 || (parseInt(d.time) >= 10 && parseInt(d.time) <= 22));
    setUtilizationData(utilization);

    // Calculate expenses for date range
    db.expenses.getAll().then(expList => {
      const totalExp = expList.reduce((acc, e) => {
        const t = Number(e.timestamp);
        return (t >= startMs && t <= endMs) ? acc + e.amount : acc;
      }, 0);
      setTotalExpenses(totalExp);
    });

  }, [sessions, dateFilterType, startDateStr, endDateStr, selectedStationFilter, games]);

  // Station name resolver
  const getStationName = (st_id: string) => {
    const found = stations.find(s => s.id === st_id);
    return found ? found.name : `Station ${st_id}`;
  };

  // Customer name resolver
  const getCustomerName = (cust_id: string | null) => {
    if (!cust_id) return 'Walk-in Customer';
    const found = customers.find(c => c.id === cust_id);
    return found ? `${found.name} (${found.phone})` : 'Walk-in Customer';
  };

  const getGameNames = (game_ids?: string[]) => {
    if (!game_ids || game_ids.length === 0) return 'None';
    return game_ids.map(id => games.find(g => g.id === id)?.name || id).join(', ');
  };

  // Filter session logs with Fuzzy Search
  const { startMs, endMs } = getDateRange();
  const rawFilteredSessions = sessions.filter(s => {
    const sTime = s.end_time ? Number(s.end_time) : Number(s.start_time);
    const timeMatch = sTime >= startMs && sTime <= endMs;
    const stationMatch = selectedStationFilter === 'all' || s.station_id === selectedStationFilter;
    return timeMatch && stationMatch;
  }).sort((a, b) => Number(b.start_time) - Number(a.start_time));

  const searchedSessions = fuzzySearch(rawFilteredSessions, searchQuery, (s) => [
    getCustomerName(s.customer_id),
    getStationName(s.station_id),
    getGameNames(s.game_ids),
    s.payment_mode,
    s.total_amount
  ]);

  // Comprehensive CSV Export
  const handleExportCustomCSV = () => {
    const { startMs, endMs } = getDateRange();
    const startStr = new Date(startMs).toLocaleDateString();
    const endStr = new Date(endMs).toLocaleDateString();
    const rangeTitle = `${dateFilterType.toUpperCase()} (${startStr} to ${endStr})`;

    const headers = [
      'Session ID',
      'Date',
      'Start Time',
      'End Time',
      'Station',
      'Customer',
      'Players',
      'Games Played',
      'Duration (Mins)',
      'Gaming Amount',
      'Food Amount',
      'Total Amount',
      'Payment Mode',
      'Status'
    ];

    const rows = searchedSessions.map(s => {
      const start = new Date(Number(s.start_time));
      const end = s.end_time ? new Date(Number(s.end_time)) : null;
      const durationMins = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
      const foodAmt = s.orders ? s.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0) : 0;
      const gamingAmt = Math.max(0, (s.total_amount || 0) - foodAmt);

      return [
        s.id,
        start.toLocaleDateString(),
        start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
        getStationName(s.station_id),
        getCustomerName(s.customer_id),
        s.num_players || 1,
        getGameNames(s.game_ids),
        durationMins,
        `${currency} ${gamingAmt.toFixed(2)}`,
        `${currency} ${foodAmt.toFixed(2)}`,
        `${currency} ${(s.total_amount || 0).toFixed(2)}`,
        s.payment_mode || 'N/A',
        s.status
      ];
    });

    exportToCSV({
      title: 'Gaming Cafe Sales & Station History Report',
      cafeName,
      dateRangeStr: rangeTitle,
      summaryMetrics: [
        { label: 'Total Gross Revenue', value: `${currency} ${totalRevenue.toFixed(2)}` },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics & Station Reports</h1>
          <p className="text-xs text-muted-foreground mt-1">Detailed revenue, station play history, game metrics, and financial breakdown.</p>
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

      {/* Date & Station Filter Bar */}
      <Card className="bg-card border-border p-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Filter Period:
            </span>

            <div className="flex bg-black/40 border border-white/10 rounded-lg p-1 gap-1">
              <button
                onClick={() => setDateFilterType('today')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  dateFilterType === 'today' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateFilterType('yesterday')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  dateFilterType === 'yesterday' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setDateFilterType('week')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  dateFilterType === 'week' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setDateFilterType('month')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  dateFilterType === 'month' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setDateFilterType('custom')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                  dateFilterType === 'custom' ? 'bg-indigo-600 text-white font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          {dateFilterType === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-36 h-8 text-xs border-border bg-background"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="w-36 h-8 text-xs border-border bg-background"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase shrink-0">Station Filter:</span>
            <Select value={selectedStationFilter} onValueChange={setSelectedStationFilter}>
              <SelectTrigger className="w-48 h-8 text-xs border-border bg-background">
                <SelectValue placeholder="All Stations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stations</SelectItem>
                {stations.map(st => (
                  <SelectItem key={st.id} value={st.id}>{st.name} ({st.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground">{currency} {totalRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-emerald-400 mt-1">{sessionCount} completed sessions</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gaming Time Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-indigo-400">{currency} {gamingRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Console, PC & Table charges</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Food & Drinks Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">{currency} {foodRevenue.toLocaleString()}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Snacks, Beverages & Combos</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
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

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Revenue Breakdown Timeline</CardTitle>
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
                <Bar dataKey="gaming" stackId="a" fill="#8b5cf6" name="Gaming" />
                <Bar dataKey="food" stackId="a" fill="#10b981" name="Food" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground text-base">Peak Operational Hours</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilizationData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" allowDecimals={false} fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="sessions" fill="#ec4899" name="Sessions Started" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Station Play History & Accidental Close Billing Recovery Log */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-card-foreground flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" /> Station Play History & Billing Log ({searchedSessions.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect who played on each station. If a session was accidentally closed, click "View Bill" to re-examine or print invoice.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Fuzzy search player, station, games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-border bg-background/50 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {searchedSessions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No session play history matches the current date/station filters.</div>
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
                  <TableHead className="text-muted-foreground">Payment</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchedSessions.map(s => {
                  const startMs = new Date(s.start_time).getTime();
                  const endMs = s.end_time ? new Date(s.end_time).getTime() : Date.now();
                  const durationMins = Math.max(1, Math.round((endMs - startMs) / 60000));

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
                        {currency} {(s.total_amount || s.base_amount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 font-mono">
                          {s.payment_mode || 'cash'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSession(s)}
                          className="h-7 text-[11px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                        >
                          View Bill
                        </Button>
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
        station={stations.find(st => st.id === selectedSession?.station_id)}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
