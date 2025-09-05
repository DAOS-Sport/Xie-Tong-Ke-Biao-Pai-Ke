import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AdminSchedule from "@/pages/admin-schedule";
import CoachView from "@/pages/coach-view";
import Statistics from "@/pages/statistics";
import VenueSchedule from "@/pages/venue-schedule";
import VenueScheduleEdit from "@/pages/venue-schedule-edit";
import FindCoach from "@/pages/find-coach";
import TeacherPortal from "@/pages/teacher-portal";
import MultiSchoolAdmin from "@/pages/multi-school-admin";
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
  return (
    <Switch>
      {/* Public pages - no authentication required */}
      <Route path="/" component={AdminSchedule} />
      <Route path="/admin/schedule" component={AdminSchedule} />
      <Route path="/coach" component={CoachView} />
      <Route path="/venue-schedule" component={VenueSchedule} />
      <Route path="/find-coach" component={FindCoach} />
      
      {/* Multi-school teacher portal */}
      <Route path="/teacher-portal" component={TeacherPortal} />
      <Route path="/teacher/:schoolCode" component={TeacherPortal} />
      
      {/* Multi-school admin */}
      <Route path="/multi-school-admin" component={MultiSchoolAdmin} />
      
      {/* Password protected admin functions */}
      <Route path="/venue-schedule-edit" component={VenueScheduleEdit} />
      <Route path="/statistics" component={Statistics} />
      
      {/* Auth pages */}
      <Route path="/home" component={Home} />
      <Route path="/landing" component={Landing} />
      
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
