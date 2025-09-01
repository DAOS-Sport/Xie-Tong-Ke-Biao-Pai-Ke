import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AdminSchedule from "@/pages/admin-schedule";
import CoachView from "@/pages/coach-view";
import Statistics from "@/pages/statistics";
import PasswordProtect from "@/components/password-protect";

// Protected AdminSchedule component
function ProtectedAdminSchedule() {
  return (
    <PasswordProtect>
      <AdminSchedule />
    </PasswordProtect>
  );
}

// Protected Statistics component
function ProtectedStatistics() {
  return (
    <PasswordProtect>
      <Statistics />
    </PasswordProtect>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={CoachView} />
          <Route path="/home" component={Home} />
          <Route path="/admin/schedule" component={ProtectedAdminSchedule} />
          <Route path="/coach" component={CoachView} />
          <Route path="/statistics" component={ProtectedStatistics} />
        </>
      )}
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
