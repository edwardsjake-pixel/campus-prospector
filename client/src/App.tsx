import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/dashboard";
import Instructors from "@/pages/instructors";
import Courses from "@/pages/courses";
import Visits from "@/pages/visits";
import Planner from "@/pages/planner";
import Availability from "@/pages/availability";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/api/login" component={() => { window.location.href = "/api/login"; return null; }} />
      <Route path="/login" component={Login} />
      
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/instructors">
        {() => <ProtectedRoute component={Instructors} />}
      </Route>
      <Route path="/courses">
        {() => <ProtectedRoute component={Courses} />}
      </Route>
      <Route path="/visits">
        {() => <ProtectedRoute component={Visits} />}
      </Route>
      <Route path="/planner">
        {() => <ProtectedRoute component={Planner} />}
      </Route>
      <Route path="/availability">
        {() => <ProtectedRoute component={Availability} />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
