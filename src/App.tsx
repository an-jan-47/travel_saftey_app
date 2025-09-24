import React, { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Itinerary from './pages/Itinerary';
import Tracking from './pages/Tracking';
import SOS from './pages/SOS';
import NotFound from './pages/NotFound';
import { authHelpers } from './lib/supabase';
import { AutoCheckInService } from './lib/autoCheckInService';
import { User, Session } from '@supabase/supabase-js';

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check initial auth state
    const checkAuthStateAsync = async () => {
      try {
        const currentUser = await authHelpers.getCurrentUser();
        setUser(currentUser);
        
        // If user is already authenticated, start auto check-in
        if (currentUser) {
          initializeAutoCheckIn();
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStateAsync();
    
    // Listen for auth changes
    const { data: { subscription } } = authHelpers.onAuthStateChange((event, session: Session | null) => {
      if (event === 'SIGNED_IN') {
        setUser(session?.user || null);
        // Start auto check-in service when user signs in
        initializeAutoCheckIn();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        // Stop auto check-in service when user signs out
        stopAutoCheckIn();
      }
    });

    return () => {
      subscription?.unsubscribe();
      // Clean up auto check-in service
      stopAutoCheckIn();
    };
  }, []);

  const initializeAutoCheckIn = async () => {
    try {
      const autoCheckInService = AutoCheckInService.getInstance();
      
      // Request notification permission
      const notificationGranted = await autoCheckInService.requestNotificationPermission();
      
      if (notificationGranted) {
        console.log('Notifications enabled for auto check-in');
      } else {
        console.log('Notifications not enabled - auto check-in will still work but without notifications');
      }
      
      // Service starts automatically when getInstance is called
      console.log('Auto check-in service initialized');
    } catch (error) {
      console.error('Error initializing auto check-in service:', error);
    }
  };

  const stopAutoCheckIn = () => {
    try {
      const autoCheckInService = AutoCheckInService.getInstance();
      autoCheckInService.stop();
      console.log('Auto check-in service stopped');
    } catch (error) {
      console.error('Error stopping auto check-in service:', error);
    }
  };

  const handleAuthSuccess = () => {
    // Refresh auth state after successful authentication
    const refreshAuthState = async () => {
      try {
        const currentUser = await authHelpers.getCurrentUser();
        setUser(currentUser);
        if (currentUser) {
          initializeAutoCheckIn();
        }
      } catch (error) {
        console.error('Error refreshing auth state:', error);
      }
    };
    refreshAuthState();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <Auth onAuthSuccess={handleAuthSuccess} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navigation />
            <main className="pt-16 md:pt-0 pb-20 md:pb-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/itinerary" element={<Itinerary />} />
                <Route path="/tracking" element={<Tracking />} />
                <Route path="/sos" element={<SOS />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;