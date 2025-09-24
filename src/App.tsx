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
import { authHelpers, dbHelpers } from './lib/supabase';
import { AutoCheckInService } from './lib/autoCheckInService';
import { User, Session } from '@supabase/supabase-js';

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to fetch and store tourist profile
  const storeUserProfile = async (userId: string) => {
    console.log('storeUserProfile function called with userId:', userId);
    try {
      const { data: profile, error } = await dbHelpers.getTouristProfile(userId);
      if (profile && !error) {
        localStorage.setItem('tourist_id', profile.tourist_id);
        console.log('Tourist ID stored successfully:', profile.tourist_id);
      } else {
        console.error('Failed to fetch tourist profile:', error);
      }
    } catch (error) {
      console.error('Error storing user profile:', error);
    }
  };

  const initializeAutoCheckIn = async () => {
    try {
      const autoCheckInService = AutoCheckInService.getInstance();
      
      // Request notification permission
      const notificationGranted = await autoCheckInService.requestNotificationPermission();
      
      if (notificationGranted) {
        autoCheckInService.start();
        console.log('Auto check-in service started');
      } else {
        console.log('Notification permission denied - auto check-in disabled');
      }
    } catch (error) {
      console.error('Failed to initialize auto check-in:', error);
    }
  };

  const stopAutoCheckIn = () => {
    try {
      AutoCheckInService.getInstance().stop();
      console.log('Auto check-in service stopped');
    } catch (error) {
      console.error('Failed to stop auto check-in:', error);
    }
  };

  useEffect(() => {
    // Check initial auth state
    const checkAuthStateAsync = async () => {
      try {
        const currentUser = await authHelpers.getCurrentUser();
        setUser(currentUser);
        
        // If user is already authenticated, store profile and start auto check-in
        if (currentUser) {
          console.log('Current user found, storing profile for:', currentUser.id);
          try {
            await storeUserProfile(currentUser.id);
            initializeAutoCheckIn();
          } catch (error) {
            console.error('Error storing initial user profile:', error);
          }
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStateAsync();
    
    // Listen for auth changes
    const { data: { subscription } } = authHelpers.onAuthStateChange(async (event, session: Session | null) => {
      console.log('Auth state change event:', event, 'User ID:', session?.user?.id);
      if (event === 'SIGNED_IN') {
        setUser(session?.user || null);
        // Store user profile and start auto check-in service when user signs in
        if (session?.user) {
          console.log('About to call storeUserProfile for user:', session.user.id);
          try {
            await storeUserProfile(session.user.id);
            initializeAutoCheckIn();
          } catch (error) {
            console.error('Error in auth change handler:', error);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        // Clear tourist_id and stop auto check-in service when user signs out
        localStorage.removeItem('tourist_id');
        stopAutoCheckIn();
      }
    });

    return () => {
      subscription?.unsubscribe();
      // Clean up auto check-in service
      stopAutoCheckIn();
    };
  }, []);

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