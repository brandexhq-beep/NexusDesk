import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Game, Session } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddGameModal } from '../components/AddGameModal';

export function Games() {
  const [games, setGames] = useState<Game[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const gamesData = await db.games.getAll();
    const sessionsData = await db.sessions.getAll();
    setGames(gamesData);
    setSessions(sessionsData.filter(s => s.status === 'active'));
  };

  const handleUpdateCopies = async (id: string, value: string) => {
    const newCopies = parseInt(value, 10);
    if (isNaN(newCopies) || newCopies < 1) return;
    
    await db.games.update(id, { total_copies: newCopies });
    loadData();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await db.games.update(id, { active: !current });
    loadData();
  };

  const getAvailableCopies = (gameId: string, total: number) => {
    const inUse = sessions.reduce((count, session) => {
      if (session.game_ids && session.game_ids.includes(gameId)) {
        return count + 1;
      }
      return count;
    }, 0);
    return Math.max(0, total - inUse);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Games Inventory</h1>
        <Button onClick={() => setIsAddOpen(true)}>Add Game</Button>
      </div>
      
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Physical Games</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground text-center">Total Copies</TableHead>
                <TableHead className="text-muted-foreground text-center">Available</TableHead>
                <TableHead className="text-muted-foreground text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No games found. Add some to get started.
                  </TableCell>
                </TableRow>
              )}
              {games.map((game) => (
                <TableRow key={game.id} className="border-border hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">{game.name}</TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min="1"
                      className="w-20 h-8 border-border bg-background mx-auto text-center"
                      defaultValue={game.total_copies}
                      onBlur={(e) => {
                        if (parseInt(e.target.value) !== game.total_copies) {
                          handleUpdateCopies(game.id, e.target.value);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center font-bold text-indigo-400">
                    {getAvailableCopies(game.id, game.total_copies)}
                  </TableCell>
                  <TableCell className="text-center">
                    <input 
                      type="checkbox"
                      checked={game.active} 
                      onChange={() => handleToggleActive(game.id, game.active)} 
                      className="w-4 h-4 accent-indigo-600 bg-background border-border rounded cursor-pointer mx-auto"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddGameModal 
        open={isAddOpen} 
        onClose={() => setIsAddOpen(false)} 
        onAdd={loadData} 
      />
    </div>
  );
}
