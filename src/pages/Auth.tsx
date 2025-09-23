import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, generateTouristId, generateQRCodeURL, generateBlockchainHash } from '@/lib/supabase';

interface AuthProps {
  onAuthSuccess: () => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  
  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  // Registration form state
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    nationality: 'India',
    docType: 'passport',
    docId: '',
    emergencyContact: '',
    medicalInfo: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await authHelpers.signIn(loginData.email, loginData.password);
      
      if (error) {
        toast.error('Login failed: ' + error.message);
        return;
      }

      if (data.user) {
        toast.success('Login successful!');
        onAuthSuccess();
      }
    } catch (error) {
      toast.error('An error occurred during login');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerData.password !== registerData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (registerData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      // Create auth user
      const { data, error } = await authHelpers.signUp(
        registerData.email,
        registerData.password,
        {
          name: registerData.name,
          nationality: registerData.nationality
        }
      );

      if (error) {
        toast.error('Registration failed: ' + error.message);
        return;
      }

      if (data.user) {
        // Generate tourist profile data
        const touristId = generateTouristId();
        const qrCodeUrl = generateQRCodeURL(touristId);
        const blockchainHash = generateBlockchainHash(touristId, registerData.docId);

        // Create tourist profile in database
        const { error: profileError } = await dbHelpers.createTouristProfile({
          user_id: data.user.id,
          tourist_id: touristId,
          name: registerData.name,
          nationality: registerData.nationality,
          doc_type: registerData.docType,
          doc_id: registerData.docId,
          emergency_contact: registerData.emergencyContact,
          language: 'en',
          medical_info: registerData.medicalInfo || null,
          qr_code_url: qrCodeUrl,
          blockchain_hash: blockchainHash,
          last_known_location: null
        });

        if (profileError) {
          console.error('Profile creation error:', profileError);
          toast.error('Registration successful but profile creation failed. Please contact support.');
        } else {
          toast.success('Registration successful! Please check your email to verify your account.');
          setActiveTab('login');
          setRegisterData({
            email: '',
            password: '',
            confirmPassword: '',
            name: '',
            nationality: 'India',
            docType: 'passport',
            docId: '',
            emergencyContact: '',
            medicalInfo: ''
          });
        }
      }
    } catch (error) {
      toast.error('An error occurred during registration');
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Smart Tourist Safety</CardTitle>
          <CardDescription>
            Secure your journey with digital identity and real-time safety features
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={loginData.email}
                    onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginData.password}
                    onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
                
                <div className="text-center text-sm text-muted-foreground">
                  <p>Demo Account:</p>
                  <p>Email: demo@tourist.com</p>
                  <p>Password: Demo123!</p>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={registerData.name}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Select 
                      value={registerData.nationality} 
                      onValueChange={(value) => setRegisterData(prev => ({ ...prev, nationality: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="India">India</SelectItem>
                        <SelectItem value="USA">USA</SelectItem>
                        <SelectItem value="UK">UK</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="Australia">Australia</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Create password"
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm password"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="docType">Document Type</Label>
                    <Select 
                      value={registerData.docType} 
                      onValueChange={(value) => setRegisterData(prev => ({ ...prev, docType: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="national_id">National ID</SelectItem>
                        <SelectItem value="drivers_license">Driver's License</SelectItem>
                        <SelectItem value="voter_id">Voter ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="docId">Document ID</Label>
                    <Input
                      id="docId"
                      placeholder="Document number"
                      value={registerData.docId}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, docId: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">Emergency Contact</Label>
                  <Input
                    id="emergencyContact"
                    placeholder="Emergency contact number"
                    value={registerData.emergencyContact}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="medicalInfo">Medical Information (Optional)</Label>
                  <Textarea
                    id="medicalInfo"
                    placeholder="Any medical conditions, allergies, or important health information"
                    value={registerData.medicalInfo}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, medicalInfo: e.target.value }))}
                    rows={3}
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;