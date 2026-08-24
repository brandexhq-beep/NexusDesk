import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { Game, Session, Station } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddGameModal } from '../components/AddGameModal';
import { Trash2, Plus, Search, Gamepad2, Laptop } from 'lucide-react';
import { toast } from 'sonner';

export function Games() {
  const [games, setGames] = useState<Game[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingStationGame, setEditingStationGame] = useState<Game | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [gamesData, stationsData, sessionsData] = await Promise.all([
      db.games.getAll(),
      db.stations.getAll(),
      db.sessions.getAll()
    ]);
    setGames(gamesData);
    setStations(stationsData);
    setSessions(sessionsData.filter(s => s.status === 'active'));
  };

  const handleUpdateCopies = async (id: string, value: string) => {
    const newCopies = parseInt(value, 10);
    if (isNaN(newCopies) || newCopies < 1) return;
    
    await db.games.update(id, { total_copies: newCopies });
    toast.success('Updated total copies');
    loadData();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await db.games.update(id, { active: !current });
    toast.info(!current ? 'Game marked active' : 'Game marked inactive');
    loadData();
  };

  const handleDeleteGame = async (game: Game) => {
    const isRunning = sessions.some(s => s.game_ids && s.game_ids.includes(game.id));
    if (isRunning) {
      toast.error('Cannot delete game while a session is actively playing it.');
      return;
    }

    if (confirm(`Are you sure you want to permanently delete "${game.name}"?`)) {
      try {
        await db.games.delete(game.id);

        // Also clean up references from stations
        for (const st of stations) {
          if (st.installed_games && (st.installed_games.includes(game.id) || (game.seed_id && st.installed_games.includes(game.seed_id)))) {
            const updated = st.installed_games.filter(id => id !== game.id && id !== game.seed_id);
            await db.stations.update(st.id, { installed_games: updated });
          }
        }

        toast.success(`Deleted "${game.name}"`);
        loadData();
      } catch (err) {
        console.error(err);
        toast.error('Failed to delete game');
      }
    }
  };

  const toggleStationInstalled = async (stationId: string, game: Game) => {
    const targetStation = stations.find(s => s.id === stationId);
    if (!targetStation) return;

    const currentInstalled = targetStation.installed_games || [];
    const isInstalled = currentInstalled.includes(game.id) || (game.seed_id && currentInstalled.includes(game.seed_id));

    let nextList: string[];
    if (isInstalled) {
      nextList = currentInstalled.filter(id => id !== game.id && id !== game.seed_id);
    } else {
      nextList = [...currentInstalled, game.id];
    }

    await db.stations.update(targetStation.id, { installed_games: nextList });
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

  const getStationsInstalled = (game: Game) => {
    return stations.filter(st => {
      const installed = st.installed_games || [];
      return installed.includes(game.id) || (game.seed_id && installed.includes(game.seed_id));
    });
  };

  const filteredGames = games.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (g.category && g.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (statusFilter === 'active') return g.active !== false;
    if (statusFilter === 'inactive') return g.active === false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Gamepad2 className="w-8 h-8 text-indigo-400" />
            Games Inventory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage physical game copies, active statuses, and station unit assignments.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="w-4 h-4 mr-2" /> Add Game
        </Button>
      </div>

      {/* Control Bar: Search & Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input 
            placeholder="Search game by name or category..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-black/20 border-white/10"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-black/20 rounded-lg border border-white/10 text-xs self-start sm:self-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              statusFilter === 'all' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            All ({games.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              statusFilter === 'active' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-emerald-400'
            }`}
          >
            Active ({games.filter(g => g.active !== false).length})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              statusFilter === 'inactive' 
                ? 'bg-zinc-700 text-white shadow-sm' 
                : 'text-muted-foreground hover:text-zinc-300'
            }`}
          >
            Inactive ({games.filter(g => g.active === false).length})
          </button>
        </div>
      </div>
      
      <Card className="bg-card border-border shadow-md">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-card-foreground text-lg flex items-center justify-between">
            <span>Games Catalog</span>
            <span className="text-xs font-normal text-muted-foreground">Showing {filteredGames.length} of {games.length} titles</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground pl-6">Name</TableHead>
                <TableHead className="text-muted-foreground">Category</TableHead>
                <TableHead className="text-muted-foreground">Installed On Stations</TableHead>
                <TableHead className="text-muted-foreground text-center">Total Copies</TableHead>
                <TableHead className="text-muted-foreground text-center">Available</TableHead>
                <TableHead className="text-muted-foreground text-center">Active</TableHead>
                <TableHead className="text-muted-foreground text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGames.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No games matching the current criteria.
                  </TableCell>
                </TableRow>
              )}
              {filteredGames.map((game) => {
                const installedStations = getStationsInstalled(game);
                const isInactive = game.active === false;

                return (
                  <TableRow 
                    key={game.id} 
                    className={`border-border hover:bg-muted/40 transition-colors ${isInactive ? 'opacity-55' : ''}`}
                  >
                    <TableCell className="font-medium text-foreground pl-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{game.name}</span>
                        {isInactive && (
                          <span className="text-[10px] text-amber-500 font-mono">Inactive (Hidden from session start)</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {game.category ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono uppercase tracking-wider">
                          {game.category}
                        </span>
                      ) : '-'}
                    </TableCell>

                    {/* Installed On Stations */}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                        {installedStations.length > 0 ? (
                          installedStations.map(st => (
                            <span 
                              key={st.id}
                              className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-medium"
                            >
                              {st.name.replace('PS5 ', '')}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingStationGame(game)}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium ml-1"
                        >
                          Manage
                        </button>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="1"
                        className="w-16 h-8 border-border bg-background mx-auto text-center font-mono text-sm"
                        defaultValue={game.total_copies}
                        onBlur={(e) => {
                          if (parseInt(e.target.value) !== game.total_copies) {
                            handleUpdateCopies(game.id, e.target.value);
                          }
                        }}
                      />
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="font-mono font-bold text-sm text-cyan-400">
                        {getAvailableCopies(game.id, game.total_copies)}
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      <input 
                        type="checkbox"
                        checked={game.active !== false} 
                        onChange={() => handleToggleActive(game.id, game.active !== false)} 
                        className="w-4 h-4 accent-emerald-500 bg-background border-border rounded cursor-pointer mx-auto"
                        title={game.active !== false ? 'Active (Click to disable)' : 'Inactive (Click to enable)'}
                      />
                    </TableCell>

                    <TableCell className="text-right pr-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteGame(game)}
                        className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Game"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Quick Manage Stations for a Game */}
      {editingStationGame && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Laptop className="w-5 h-5 text-indigo-400" />
                Assign Stations: {editingStationGame.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Toggle which stations have this game installed. Changes apply immediately.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-3 bg-black/20 rounded-lg border border-white/5">
              {stations.map(st => {
                const isInstalled = (st.installed_games || []).includes(editingStationGame.id) || 
                  (editingStationGame.seed_id && (st.installed_games || []).includes(editingStationGame.seed_id));

                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => toggleStationInstalled(st.id, editingStationGame)}
                    className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-all flex items-center justify-between ${
                      isInstalled 
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm' 
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{st.name}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isInstalled ? 'bg-indigo-500/30 text-indigo-200' : 'opacity-40'}`}>
                      {isInstalled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setEditingStationGame(null)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddGameModal 
        open={isAddOpen} 
        onClose={() => setIsAddOpen(false)} 
        onAdd={loadData} 
      />
    </div>
  );
}
