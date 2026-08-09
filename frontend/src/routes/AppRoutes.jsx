import { Routes, Route } from "react-router-dom";

import Landing from "../pages/Landing";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import Dashboard from "../pages/Dashboard";

import DashboardLayout from "../layouts/DashboardLayout";
import LiveMap from "../pages/LiveMap";
import RiskPrediction from "../pages/RiskPredictions";
import Recommendations from "../pages/Recommendations";
import CitizenApp from "../pages/CitizenApp";

import DigitalTwin from "../pages/DigitalTwin";
import AIAssistant from "../pages/AIAssistant";
import IncidentSummary from "../pages/IncidentSummary";
import CrowdMonitoring from "../pages/CrowdMonitoring";
import Analytics from "../pages/authority/Analytics";
import EventSelection from "../pages/EventsSelection";
import CreateEvent from "../pages/authority/CreateEvent";
import AdminVerification from "../pages/admin/AdminVerification";
import CommandCenter from "../pages/authority/CommandCenter";
import MapEditor from "../pages/authority/MapEditor";

import ProtectedRoute from "../components/ProtectedRoute";

const ANY_AUTH = ["citizen", "authority", "admin"];

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<DashboardLayout />}>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={ANY_AUTH}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Citizen-facing, event-scoped (open to any logged-in role) */}
      <Route
        path="/events"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <EventSelection />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events/:id/dashboard"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <CrowdMonitoring />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events/:id/map"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <LiveMap />
          </ProtectedRoute>
        }
      />

      {/* Standalone pages not yet event-scoped — left open to any logged-in role, adjust as needed */}
      <Route
        path="/risk"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <RiskPrediction />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recommendations"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <Recommendations />
          </ProtectedRoute>
        }
      />
      <Route
        path="/citizen"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <CitizenApp />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-twin"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <DigitalTwin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-assistant"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <AIAssistant />
          </ProtectedRoute>
        }
      />
      <Route
        path="/incident"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <IncidentSummary />
          </ProtectedRoute>
        }
      />

      {/* Authority only */}
      <Route
        path="/authority/events"
        element={
          <ProtectedRoute roles={["authority"]}>
            <CreateEvent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/events/:id/command-center"
        element={
          <ProtectedRoute roles={["authority"]}>
            <CommandCenter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/events/:id/analytics"
        element={
          <ProtectedRoute roles={["authority"]}>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/authority/events/:id/map"
        element={
          <ProtectedRoute roles={["authority"]}>
            <MapEditor />
          </ProtectedRoute>
        }
      />

      {/* Admin only */}
      <Route
        path="/admin/verify-authorities"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminVerification />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
