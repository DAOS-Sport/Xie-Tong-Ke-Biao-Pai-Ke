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
import TeacherPortal from "@/pages/teacher-portal";
import MultiSchoolAdmin from "@/pages/multi-school-admin";
import CoachPortal from "@/pages/coach-portal";
import CoachApproval from "@/pages/coach-approval";
import CoachAssignment from "@/pages/coach-assignment";
import SchoolView from "@/pages/school-view";
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
      
      {/* Multi-school teacher portal */}
      <Route path="/teacher-portal" component={TeacherPortal} />
      <Route path="/teacher/:schoolCode" component={TeacherPortal} />
      
      {/* Multi-school admin */}
      <Route path="/multi-school-admin" component={MultiSchoolAdmin} />
      
      {/* Individual school/venue public pages */}
      <Route path="/school/:venueName" component={SchoolView} />
      
      {/* Coach portal (front-end for coaches) */}
      <Route path="/coach-portal" component={CoachPortal} />
      
      {/* Password protected admin functions */}
      <Route path="/venue-schedule-edit" component={VenueScheduleEdit} />
      <Route path="/coach-assignment" component={CoachAssignment} />
      <Route path="/statistics" component={Statistics} />
      <Route path="/coach-approval" component={CoachApproval} />
      
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
