import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { db } from '../services/db';
import type { Customer } from '../types';
import { Download } from 'lucide-react';

export function Reports() {
  const [topCustomers, setTopCustomers] = useState<Customer[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [utilizationData, setUtilizationData] = useState<any[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [popularGames, setPopularGames] = useState<any[]>([]);
  const [currency, setCurrency] = useState('₹');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const customers = await db.customers.getAll();
    const sorted = [...customers].sort((a, b) => b.loyalty_points - a.loyalty_points).slice(0, 5);
    setTopCustomers(sorted);

    const transactions = await db.transactions.getAll();
    const sessions = await db.sessions.getAll();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    // Instead of fixed 30/31 days, calculate revenue for the current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let todayRev = 0;
    let monthRev = 0;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekData = Array.from({length: 7}).map((_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
      return {
        name: days[d.getDay()],
        gaming: 0,
        food: 0,
        date: d.getDate()
      };
    });

    const settings = await db.settings.get();
    setCurrency(settings.currency_symbol || '₹');

    const expenses = await db.expenses.getAll();
    let totalExp = 0;
    expenses.forEach(e => {
       if (Number(e.timestamp) >= monthStart) totalExp += e.amount;
    });
    setMonthExpenses(totalExp);

    const allGames = await db.games.getAll();
    const gameCounts: Record<string, number> = {};
    const hourCounts = Array(24).fill(0);

    sessions.forEach(s => {
      if (s.status !== 'completed' || !s.end_time) return;
      const end = Number(s.end_time);
      if (end >= todayStart) todayRev += s.total_amount;
      if (end >= monthStart) monthRev += s.total_amount;
      
      const sDate = new Date(end).getDate();
      const weekDay = weekData.find(w => w.date === sDate);
      if (weekDay) {
         const foodCost = s.orders ? s.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0) : 0;
         weekDay.gaming += Math.max(0, s.total_amount - foodCost);
         weekDay.food += foodCost;
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

    const popular = Object.entries(gameCounts)
      .map(([id, count]) => {
        const game = allGames.find(g => g.id === id);
        return { name: game ? game.name : 'Unknown', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setPopularGames(popular);
    
    // Process standalone food transactions (not attached to completed sessions)
    transactions.forEach(t => {
      if (t.type === 'food_charge' || t.type === 'food_order') {
        const time = Number(t.timestamp);
        if (time >= todayStart) todayRev += t.amount;
        if (time >= monthStart) monthRev += t.amount;
        const sDate = new Date(time).getDate();
        const weekDay = weekData.find(w => w.date === sDate);
        if (weekDay) {
           weekDay.food += t.amount;
        }
      }
    });

    setTodayRevenue(todayRev);
    setMonthRevenue(monthRev);
    setRevenueData(weekData);

    const actualUtilization = hourCounts.map((count, i) => {
      const ampm = i >= 12 ? 'pm' : 'am';
      const hour12 = i % 12 || 12;
      return { time: `${hour12}${ampm}`, sessions: count };
    }).filter(d => d.sessions > 0 || (parseInt(d.time) >= 10 && parseInt(d.time) <= 22)); // Only show active hours roughly
    setUtilizationData(actualUtilization);
  };

  const handleExportCSV = () => {
    const headers = ['Day', 'Gaming Revenue', 'Food Revenue', 'Total Revenue'];
    const rows = revenueData.map(d => [d.name, d.gaming, d.food, d.gaming + d.food]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "revenue_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Analytics Dashboard</h1>
        <Button variant="outline" className="gap-2 border-border" onClick={handleExportCSV}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{currency} {todayRevenue.toLocaleString()}</div>
            <p className="text-xs text-emerald-500 mt-1">Total incoming</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{currency} {monthRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Gross revenue</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit (Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${monthRevenue - monthExpenses >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {currency} {(monthRevenue - monthExpenses).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Revenue minus logged expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Weekly Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="gaming" stackId="a" fill="#8b5cf6" name="Gaming Time" />
                <Bar dataKey="food" stackId="a" fill="#10b981" name="Food & Snacks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">Peak Hours (Heatmap)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilizationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="sessions" fill="#ec4899" name="Total Sessions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
          <CardTitle className="text-card-foreground">Game Popularity</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Game Name</TableHead>
                  <TableHead className="text-muted-foreground text-right">Sessions Played</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popularGames.map((game, i) => (
                  <TableRow key={i} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground flex items-center gap-2">
                      <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-md">#{i+1}</span>
                      {game.name}
                    </TableCell>
                    <TableCell className="text-right text-emerald-500 font-bold">{game.count}</TableCell>
                  </TableRow>
                ))}
                {popularGames.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                      No game data recorded yet. Attach games to sessions to track popularity.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Top Customers (By Loyalty Points)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground text-right">Loyalty Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map(customer => (
                <TableRow key={customer.id} className="border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">{customer.name}</TableCell>
                  <TableCell className="text-muted-foreground">{customer.phone}</TableCell>
                  <TableCell className="text-right text-emerald-500 font-bold">{customer.loyalty_points}</TableCell>
                </TableRow>
              ))}
              {topCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No customers found yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
