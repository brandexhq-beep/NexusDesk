import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Customer } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { UserPlus, Phone, WalletCards } from 'lucide-react';
import { AddCustomerModal } from '../components/AddCustomerModal';
import { AddBalanceModal } from '../components/AddBalanceModal';
import { CustomerProfileModal } from '../components/CustomerProfileModal';

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addBalanceCustomer, setAddBalanceCustomer] = useState<Customer | null>(null);
  const [viewProfileCustomer, setViewProfileCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = () => {
    db.customers.getAll().then(setCustomers);
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
        <Button onClick={() => setIsAddModalOpen(true)} className="bg-primary text-primary-foreground gap-2">
          <UserPlus className="w-4 h-4" /> Add Customer
        </Button>
      </div>
      
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Customer Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No customers found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground text-right">Time Balance</TableHead>
                  <TableHead className="text-muted-foreground text-right">Wallet</TableHead>
                  <TableHead className="text-muted-foreground text-right">Loyalty Pts</TableHead>
                  <TableHead className="text-muted-foreground text-right">Tab</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow 
                    key={c.id} 
                    className="border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setViewProfileCustomer(c)}
                  >
                    <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                    <TableCell>
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </a>
                    </TableCell>
                    <TableCell className="text-right text-indigo-400 font-medium">{formatMinutes(c.available_minutes)}</TableCell>
                    <TableCell className="text-right text-emerald-500 font-medium">₹ {c.wallet_balance}</TableCell>
                    <TableCell className="text-right font-medium text-amber-500">{c.loyalty_points}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">₹ {c.amount_owed}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => { e.stopPropagation(); setAddBalanceCustomer(c); }} 
                        className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 gap-2"
                      >
                        <WalletCards className="w-4 h-4" /> Add Balance
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddCustomerModal 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={loadCustomers} 
      />

      <AddBalanceModal
        customer={addBalanceCustomer}
        onClose={() => setAddBalanceCustomer(null)}
        onAdd={loadCustomers}
      />

      <CustomerProfileModal
        customer={viewProfileCustomer}
        onClose={() => setViewProfileCustomer(null)}
      />
    </div>
  );
}
