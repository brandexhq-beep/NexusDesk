import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Expense, ExpenseCategory } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, Receipt } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    category: 'other' as ExpenseCategory,
    note: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await db.expenses.getAll();
    const settings = await db.settings.get();
    setCurrency(settings.currency_symbol || '₹');
    // Sort descending by timestamp
    setExpenses(data.sort((a, b) => Number(b.timestamp) - Number(a.timestamp)));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || isNaN(Number(formData.amount))) return;
    
    await db.expenses.add({
      amount: Number(formData.amount),
      category: formData.category,
      note: formData.note
    });
    
    setFormData({ amount: '', category: 'other', note: '' });
    setIsAddOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await db.expenses.delete(id);
      loadData();
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Receipt className="w-8 h-8 text-rose-500" /> Daily Expenses
        </h1>
        <Button onClick={() => setIsAddOpen(true)} className="bg-rose-600 hover:bg-rose-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Log Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-black/40 border-white/10">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider">Total Expenses Logged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-rose-500">
              {currency} {totalExpenses.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle className="text-card-foreground">Expense History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Category</TableHead>
                <TableHead className="text-muted-foreground">Note</TableHead>
                <TableHead className="text-muted-foreground text-right">Amount</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses logged yet.</TableCell>
                </TableRow>
              ) : (
                expenses.map((expense) => (
                  <TableRow key={expense.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-medium">
                      {new Date(expense.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="capitalize text-indigo-300">
                      <span className="bg-indigo-500/10 px-2 py-1 rounded-md text-xs font-semibold">
                        {expense.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{expense.note}</TableCell>
                    <TableCell className="text-right font-bold text-rose-400">
                      {currency} {expense.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleDelete(expense.id)} variant="ghost" size="icon" className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10 h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Log New Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input 
                type="number" min="0" step="1" required
                value={formData.amount} 
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="bg-black/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value as ExpenseCategory})}
                className="flex h-10 w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="inventory">Inventory (Stock/Drinks)</option>
                <option value="maintenance">Maintenance/Repairs</option>
                <option value="salary">Staff Salary</option>
                <option value="utilities">Utilities (Power/Internet)</option>
                <option value="marketing">Marketing/Ads</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Input 
                value={formData.note} 
                onChange={(e) => setFormData({...formData, note: e.target.value})}
                placeholder="e.g. Bought 2 crates of Coke"
                className="bg-black/50 border-white/10"
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white w-full">Save Expense</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
