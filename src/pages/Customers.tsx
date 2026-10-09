import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Customer } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Phone, WalletCards, Download, Search, FileSpreadsheet, Users } from 'lucide-react';
import { AddCustomerModal } from '../components/AddCustomerModal';
import { AddBalanceModal } from '../components/AddBalanceModal';
import { CustomerProfileModal } from '../components/CustomerProfileModal';
import { ImportCustomersModal } from '../components/ImportCustomersModal';
import { MergeDuplicatesModal } from '../components/MergeDuplicatesModal';
import { findDuplicateCustomerGroups } from '../lib/phone';
import { fuzzySearch } from '../lib/search';

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currency, setCurrency] = useState('₹');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [addBalanceCustomer, setAddBalanceCustomer] = useState<Customer | null>(null);
  const [viewProfileCustomer, setViewProfileCustomer] = useState<Customer | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const duplicateGroups = findDuplicateCustomerGroups(customers);
  const duplicateCount = duplicateGroups.length;

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const data = await db.customers.getAll();
    const settings = await db.settings.get();
    setCustomers(data);
    setCurrency(settings.currency_symbol || '₹');
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '0h 0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const filteredCustomers = fuzzySearch(customers, searchQuery, (c) => [
    c.name,
    c.phone,
    c.wallet_balance,
    c.loyalty_points
  ]);

  const handleExportCSV = () => {
    if (customers.length === 0) return;
    const headers = ['Name', 'Phone', 'Time Balance (mins)', 'Wallet Balance', 'Loyalty Points'];
    const rows = filteredCustomers.map(c => [
      c.name,
      c.phone || '',
      c.available_minutes || 0,
      c.wallet_balance || 0,
      c.loyalty_points || 0
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "customers_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsMergeModalOpen(true)}
            variant="outline"
            className={`flex-1 sm:flex-none gap-2 ${
              duplicateCount > 0
                ? 'border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-500/20 shadow-sm'
                : 'border-border text-muted-foreground'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" /> Merge Duplicates
            {duplicateCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                {duplicateCount}
              </span>
            )}
          </Button>
          <Button onClick={() => setIsImportModalOpen(true)} variant="outline" className="flex-1 sm:flex-none border-emerald-500/30 bg-emerald-950/10 text-emerald-400 hover:bg-emerald-500/20 gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Import Excel
          </Button>
          <Button onClick={handleExportCSV} variant="outline" className="flex-1 sm:flex-none border-border gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="flex-1 sm:flex-none bg-primary text-primary-foreground gap-2">
            <UserPlus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </div>
      
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <CardTitle className="text-card-foreground">Customer Directory ({filteredCustomers.length})</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Fuzzy search customer name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-border bg-background/50 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground text-right">Time Balance</TableHead>
                  <TableHead className="text-muted-foreground text-right">Wallet Balance</TableHead>
                  <TableHead className="text-muted-foreground text-right">Loyalty Points</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((c) => (
                    <TableRow key={c.id} className="border-border hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {c.phone}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">No phone</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-indigo-400 font-medium">{formatMinutes(c.available_minutes)}</TableCell>
                      <TableCell className="text-right text-emerald-500 font-medium">{currency} {c.wallet_balance || 0}</TableCell>
                      <TableCell className="text-right font-medium text-amber-500">{c.loyalty_points}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setViewProfileCustomer(c)}
                          className="mr-2 hover:bg-muted text-xs"
                        >
                          View Profile
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setAddBalanceCustomer(c)}
                          className="hover:bg-muted text-xs"
                        >
                          <WalletCards className="w-3.5 h-3.5 mr-1" />
                          Add Balance
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddCustomerModal 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={loadCustomers} 
      />

      <ImportCustomersModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={loadCustomers}
      />

      <MergeDuplicatesModal
        open={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        onMerged={loadCustomers}
        customers={customers}
      />

      <AddBalanceModal 
        customer={addBalanceCustomer} 
        onClose={() => setAddBalanceCustomer(null)} 
        onAdd={loadCustomers} 
      />

      <CustomerProfileModal
        customer={viewProfileCustomer}
        onClose={() => {
          setViewProfileCustomer(null);
          loadCustomers();
        }}
      />
    </div>
  );
}
