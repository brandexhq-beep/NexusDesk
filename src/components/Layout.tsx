import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Gamepad2, Users, Monitor, LogOut, Coffee, Menu as MenuIcon, LineChart, Settings as Cog } from 'lucide-react';
import { GlobalAlerts } from './GlobalAlerts';
import { db } from '../services/db';

const navItems = [
  { name: 'Dashboard', path: '/', icon: Gamepad2 },
  { name: 'Customers', path: '/customers', icon: Users },
  { name: 'Reports', path: '/reports', icon: LineChart },
  { name: 'Stations', path: '/stations', icon: Monitor },
  { name: 'Menu', path: '/menu', icon: MenuIcon },
  { name: 'Settings', path: '/settings', icon: Cog },
];

export function Layout() {
  const location = useLocation();
  const [cafeName, setCafeName] = useState('Cafe Management');
  const [cafeLogo, setCafeLogo] = useState('');

  useEffect(() => {
    db.settings.get().then(settings => {
      if (settings?.cafe_name) setCafeName(settings.cafe_name);
      if (settings?.cafe_logo_url) setCafeLogo(settings.cafe_logo_url);
    });
  }, []);

  return (
    <div className="flex h-screen bg-black text-foreground overflow-hidden">
      <GlobalAlerts />
      {/* Background ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-background to-emerald-900/10 pointer-events-none" />
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl flex flex-col relative z-10">
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
              <Link
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/5 text-indigo-400 font-medium border border-indigo-500/20 shadow-lg shadow-indigo-500/5' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 mb-4">
          <button className="group flex items-center gap-3 px-4 py-3 w-full text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all duration-300 border border-transparent hover:border-red-400/20">
            <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-16 border-b border-white/5 flex items-center px-8 bg-black/40 backdrop-blur-md">
          <h2 className="text-xl font-semibold capitalize text-foreground/90 tracking-tight">
            {navItems.find(i => i.path === location.pathname)?.name || 'Cafe Management'}
          </h2>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
