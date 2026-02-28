import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { 
  LayoutDashboard, 
  Users, 
  MapPin, 
  Calendar, 
  GanttChart,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { Organization } from "@shared/schema";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: org } = useQuery<Organization | null>({
    queryKey: ["/api/user/organization"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
  });

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Campus Plan', href: '/planner', icon: Calendar },
    { name: 'Availability', href: '/availability', icon: GanttChart },
    { name: 'Faculty & Courses', href: '/instructors', icon: Users },
    { name: 'Visits', href: '/visits', icon: MapPin },
  ];

  const BrandingHeader = () => {
    if (org?.logoUrl) {
      return (
        <div className="p-6 border-b border-white/10">
          <div className="max-h-14 flex items-center" data-testid="img-sidebar-logo">
            <img
              src={org.logoUrl}
              alt={org.name}
              className="max-h-14 max-w-full object-contain"
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Powered by CampusAlly</p>
        </div>
      );
    }
    return (
      <div className="p-6 border-b border-white/10">
        <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          CampusAlly
        </h1>
        <p className="text-sm text-slate-400 mt-1">EdTech Sales OS</p>
      </div>
    );
  };

  const MobileBranding = () => {
    if (org?.logoUrl) {
      return (
        <img
          src={org.logoUrl}
          alt={org.name}
          className="ml-4 max-h-8 object-contain"
          data-testid="img-mobile-logo"
        />
      );
    }
    return <span className="ml-4 font-display font-bold text-lg text-white">CampusAlly</span>;
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <BrandingHeader />

      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href} onClick={() => setOpen(false)}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group ${
                  isActive
                    ? `text-white shadow-lg ${org?.primaryColor ? "" : "bg-primary shadow-primary/25"}`
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                style={isActive && org?.primaryColor ? { backgroundColor: org.primaryColor, boxShadow: `0 10px 15px -3px ${org.primaryColor}40` } : undefined}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                <span className="font-medium">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 bg-slate-900/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-10 w-10 border-2 border-white/10">
            <AvatarImage src={user?.profileImageUrl} />
            <AvatarFallback>{user?.firstName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Link href="/settings" onClick={() => setOpen(false)}>
            <div
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                location === "/settings"
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
              data-testid="link-settings"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Settings</span>
            </div>
          </Link>
          <Button 
            variant="outline" 
            className="w-full justify-start text-red-400 border-red-400/20 hover:text-red-300 hover:bg-red-400/10"
            onClick={() => logout()}
            data-testid="button-sign-out"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 fixed inset-y-0 z-50">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 flex items-center px-3 z-50 border-b border-white/10">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 min-w-[44px] min-h-[44px]">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80 border-r-0">
            <NavContent />
          </SheetContent>
        </Sheet>
        <MobileBranding />
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-3 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
