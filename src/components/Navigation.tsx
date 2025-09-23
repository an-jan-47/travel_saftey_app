import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Map, Calendar, Shield, User, Menu, Sun, Moon, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authHelpers } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState('en');

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
  };

  const handleLogout = async () => {
    try {
      const { error } = await authHelpers.signOut();
      if (error) {
        toast.error('Logout failed: ' + error.message);
      } else {
        toast.success('Logged out successfully');
        navigate('/');
      }
    } catch (error) {
      toast.error('An error occurred during logout');
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { id: '/', label: 'Dashboard', icon: Home, path: '/' },
    { id: '/itinerary', label: 'Trip Plan', icon: Calendar, path: '/itinerary' },
    { id: '/tracking', label: 'Track', icon: Map, path: '/tracking' },
    { id: '/sos', label: 'SOS', icon: Shield, path: '/sos' },
  ];

  const supportedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'hi', name: 'हिन्दी' },
  ];

  const getCurrentPage = () => {
    return location.pathname;
  };

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 md:hidden z-50">
        <div className="flex justify-around items-center py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = getCurrentPage() === item.path;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 h-auto py-2 px-3"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:flex-col md:fixed md:left-0 md:top-0 md:h-full md:w-64 md:bg-white md:dark:bg-gray-900 md:border-r md:border-gray-200 md:dark:border-gray-700 md:z-40">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-600">Tourist Safety</h1>
        </div>
        
        <nav className="flex-1 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = getCurrentPage() === item.path;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'ghost'}
                onClick={() => navigate(item.path)}
                className="w-full justify-start mb-2"
              >
                <Icon className="h-4 w-4 mr-3" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleThemeToggle}
              className="w-full"
            >
              {theme === 'light' ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
              {theme === 'light' ? 'Dark' : 'Light'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 z-50">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-lg font-bold text-blue-600">Tourist Safety</h1>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <div className="space-y-4 mt-6">
                <div>
                  <label className="text-sm font-medium">Language</label>
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {supportedLanguages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Theme</label>
                  <Button
                    variant="outline"
                    onClick={handleThemeToggle}
                    className="w-full mt-1 justify-start"
                  >
                    {theme === 'light' ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
                    {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                  </Button>
                </div>

                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="w-full justify-start"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main content padding for desktop */}
      <div className="md:ml-64" />
    </>
  );
}