import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { MenuItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddMenuItemModal } from '../components/AddMenuItemModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Trash2 } from 'lucide-react';

export function Menu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const data = await db.menu.getAll();
    setItems(data);
  };

  const handleUpdateStock = async (id: string, value: string) => {
    const newStock = parseInt(value, 10);
    if (isNaN(newStock) || newStock < 0) return;
    
    await db.menu.update(id, { stock_quantity: newStock, low_stock_notified: false });
    loadItems();
  };

  const handleDelete = async () => {
    if (itemToDelete) {
      await db.menu.delete(itemToDelete.id);
      setItemToDelete(null);
      loadItems();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Menu & Combos</h1>
        <Button onClick={() => setIsAddOpen(true)} className="w-full sm:w-auto">Add Item</Button>
      </div>
      
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">All Items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Category</TableHead>
                <TableHead className="text-muted-foreground">Details</TableHead>
                <TableHead className="text-muted-foreground text-right">Price</TableHead>
                <TableHead className="text-muted-foreground">Stock</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">
                    {item.name}
                    {item.subcategory && <div className="text-xs text-muted-foreground">{item.subcategory}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{item.category}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.category === 'package' && (
                      <span className="flex flex-col gap-0.5">
                        {item.package_minutes ? `${item.package_minutes} Mins` : ''}
                        {item.player_count ? `${item.player_count} Player(s)` : ''}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">₹ {item.price}</TableCell>
                  <TableCell>
                    {(item.category === 'snack' || item.category === 'drink') ? (
                      <Input
                        type="number"
                        min="0"
                        className="w-20 h-8 border-border bg-background"
                        defaultValue={item.stock_quantity || 0}
                        onBlur={(e) => {
                          if (parseInt(e.target.value) !== (item.stock_quantity || 0)) {
                            handleUpdateStock(item.id, e.target.value);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      item.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                    }`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setItemToDelete(item)} className="text-red-400 hover:text-red-300 hover:bg-red-400/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddMenuItemModal 
        open={isAddOpen} 
        onClose={() => setIsAddOpen(false)} 
        onAdd={loadItems} 
      />

      <ConfirmModal
        open={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Item"
        description={`Are you sure you want to delete ${itemToDelete?.name}? This action cannot be undone.`}
        confirmText="Delete Item"
      />
    </div>
  );
}
