import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Left Panel - Hero */}
        <div className="bg-primary p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <GraduationCap className="w-8 h-8" />
              <span className="font-display font-bold text-xl">CampusAlly</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-6 leading-tight">
              Master your campus territory.
            </h1>
            <p className="text-primary-foreground/80 text-lg">
              The ultimate sales companion for EdTech professionals. Track instructors, plan visits, and close more deals.
            </p>
          </div>
          
          {/* Abstract circles decoration */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-white/10 blur-3xl"></div>
        </div>

        {/* Right Panel - Login */}
        <div className="p-8 md:p-12 flex flex-col justify-center items-center text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h2>
          <p className="text-slate-500 mb-8">Sign in to access your dashboard</p>
          
          <Button 
            size="lg" 
            className="w-full max-w-sm bg-slate-900 hover:bg-slate-800 text-white"
            onClick={handleLogin}
          >
            Sign in with Replit
          </Button>

          <p className="mt-8 text-xs text-slate-400">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
