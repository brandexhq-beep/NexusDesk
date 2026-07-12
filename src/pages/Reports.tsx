import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
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
    const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

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

    sessions.forEach(s => {
      if (s.status !== 'completed' || !s.end_time) return;
      const end = Number(s.end_time);
      if (end >= todayStart) todayRev += s.total_amount;
      if (end >= thirtyDaysAgo) monthRev += s.total_amount;
      
      const sDate = new Date(end).getDate();
      const weekDay = weekData.find(w => w.date === sDate);
      if (weekDay) {
         const foodCost = s.orders ? s.orders.reduce((sum, o) => sum + (o.price_at_order * o.quantity), 0) : 0;
         weekDay.gaming += s.total_amount - foodCost;
         weekDay.food += foodCost;
      }
    });
    
    transactions.forEach(t => {
      if (t.type === 'food_charge' || t.type === 'food_order') {
        const time = Number(t.timestamp);
        if (time >= todayStart) todayRev += t.amount;
        if (time >= thirtyDaysAgo) monthRev += t.amount;
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

    const simulatedUtilization = [
      { time: '10am', ps5: 20, vr: 10, pc: 5 },
      { time: '12pm', ps5: 40, vr: 15, pc: 20 },
      { time: '2pm', ps5: 70, vr: 40, pc: 45 },
      { time: '4pm', ps5: 90, vr: 60, pc: 80 },
      { time: '6pm', ps5: 100, vr: 80, pc: 95 },
      { time: '8pm', ps5: 95, vr: 70, pc: 90 },
      { time: '10pm', ps5: 60, vr: 30, pc: 50 },
    ];
    setUtilizationData(simulatedUtilization);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">₹ {todayRevenue.toLocaleString()}</div>
            <p className="text-xs text-emerald-500 mt-1">+12% from yesterday</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">30 Days Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">₹ {monthRevenue.toLocaleString()}</div>
            <p className="text-xs text-emerald-500 mt-1">+8% from last month</p>
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
            <CardTitle className="text-card-foreground">Station Utilization (%)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={utilizationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Legend />
                <Line type="monotone" dataKey="ps5" stroke="#3b82f6" activeDot={{ r: 8 }} name="PS5 Stations" />
                <Line type="monotone" dataKey="vr" stroke="#ec4899" name="VR Stations" />
                <Line type="monotone" dataKey="pc" stroke="#f59e0b" name="Gaming PCs" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Top Customers (By Loyalty Points)</CardTitle>
        </CardHeader>
        <CardContent>
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
  );
}
