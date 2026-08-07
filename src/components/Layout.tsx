import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Gamepad2, Users, Monitor, LogOut, Coffee, Menu as MenuIcon, Settings as Cog, Disc, Megaphone, BarChart3, Receipt } from 'lucide-react';
import { GlobalAlerts } from './GlobalAlerts';
import { ReviewQueue } from './ReviewQueue';
import { WhatsAppStatus } from './WhatsAppStatus';
import { db } from '../services/db';
import { useAuth } from './AuthProvider';
import { Command } from 'cmdk';

const navItems = [
  { name: 'Dashboard', path: '/', icon: Gamepad2 },
  { name: 'Customers', path: '/customers', icon: Users },

  { name: 'Stations', path: '/stations', icon: Monitor },
  { name: 'Menu', path: '/menu', icon: MenuIcon },
  { name: 'Games', path: '/games', icon: Disc },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
  { name: 'Expenses', path: '/expenses', icon: Receipt },
  { name: 'Promotions', path: '/promotions', icon: Megaphone },
  { name: 'Settings', path: '/settings', icon: Cog },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [cafeName, setCafeName] = useState('Cafe Management');
  const [cafeLogo, setCafeLogo] = useState('');
  const [open, setOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    db.settings.get().then(settings => {
      if (settings?.cafe_name) setCafeName(settings.cafe_name);
      if (settings?.cafe_logo_url) setCafeLogo(settings.cafe_logo_url);
    });

    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <div className="flex h-screen bg-black text-foreground overflow-hidden">
      <GlobalAlerts />
      <ReviewQueue />
      
      {/* Command Palette */}
      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen}
        label="Global Command Menu"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-black/80 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden text-white"
      >
        <Command.Input 
          placeholder="Type a command or search..." 
          className="w-full bg-transparent border-b border-white/10 px-4 py-3 text-lg outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
          
          <Command.Group heading="Navigation" className="text-xs font-medium text-muted-foreground px-2 py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item 
                  key={item.path} 
                  onSelect={() => { navigate(item.path); setOpen(false); }}
                  className="flex items-center gap-2 px-2 py-2 mt-1 rounded-md cursor-pointer hover:bg-white/10 text-sm text-white aria-selected:bg-white/10"
                >
                  <Icon className="w-4 h-4" />
                  Go to {item.name}
                </Command.Item>
              );
            })}
          </Command.Group>
          
          <Command.Group heading="Actions" className="text-xs font-medium text-muted-foreground px-2 py-1 mt-2">
            <Command.Item 
              onSelect={() => { logout(); setOpen(false); }}
              className="flex items-center gap-2 px-2 py-2 mt-1 rounded-md cursor-pointer hover:bg-red-500/20 text-red-400 text-sm aria-selected:bg-red-500/20"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>

      {/* Background ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-background to-emerald-900/10 pointer-events-none" />
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 border-r border-white/5 bg-black/80 md:bg-black/40 backdrop-blur-xl flex flex-col z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center gap-3 px-6 border-b border-white/5">
          {cafeLogo ? (
            <img src={cafeLogo} alt="Logo" className="w-9 h-9 object-cover rounded-xl shadow-lg shadow-indigo-500/20" />
          ) : (
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
              <Coffee className="w-5 h-5 text-white" />
            </div>
          )}
          <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent truncate">{cafeName}</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <a
                href={item.path}
                key={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer ${
                  isActive 
                    ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/5 text-indigo-400 font-medium border border-indigo-500/20 shadow-lg shadow-indigo-500/5' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                {item.name}
              </a>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 mb-4">
          <button 
            onClick={logout}
            className="group flex items-center gap-3 px-4 py-3 w-full text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all duration-300 border border-transparent hover:border-red-400/20"
          >
            <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
            Sign Out
          </button>
          <div className="mt-6 text-center">
            <a href="https://www.brandex.co.in" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground/60 hover:text-indigo-400 transition-colors">
              Built by Brandex
            </a>
          </div>
          <WhatsAppStatus />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10 w-full">
        <header className="h-16 border-b border-white/5 flex items-center px-4 md:px-8 bg-black/40 backdrop-blur-md">
          <button 
            className="md:hidden mr-4 p-2 text-muted-foreground hover:text-foreground" 
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-semibold capitalize text-foreground/90 tracking-tight truncate">
            {navItems.find(i => i.path === location.pathname)?.name || 'Cafe Management'}
          </h2>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
