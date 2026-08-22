import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "../pages/Landing";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import VerifyOtp from "../pages/VerifyOtp";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import GoogleSignupComplete from "../pages/GoogleSignupComplete";

import LiveMap from "../pages/LiveMap";
import CitizenApp from "../pages/CitizenApp";

import CrowdMonitoring from "../pages/CrowdMonitoring";
import Analytics from "../pages/authority/Analytics";
import EventSelection from "../pages/EventsSelection";
import CreateEvent from "../pages/authority/CreateEvent";
import AdminVerification from "../pages/admin/AdminVerification";
import CommandCenter from "../pages/authority/CommandCenter";
import MapEditor from "../pages/authority/MapEditor";
import AiProvider from "../pages/settings/AiProvider";

import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";

const ANY_AUTH = ["citizen", "authority", "admin"];

/**
 * `/dashboard` used to render a page built entirely from hardcoded numbers.
 * The URL may be bookmarked, so instead of 404ing we forward each role to the
 * real console it should be using.
 */
function DashboardRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "authority") return <Navigate to="/authority/events" replace />;
  if (user.role === "admin") return <Navigate to="/admin/verify-authorities" replace />;
  return <Navigate to="/events" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Auth flow: email OTP verification, Google profile completion, and
          password recovery. These are public (reached mid-signup / mid-reset). */}
      <Route path="/verify-otp" element={<VerifyOtp />} />
      {/* Two paths for the same page: /google/complete is what the Google button
          navigates to, /signup/google is the alias used elsewhere in the app. */}
      <Route path="/google/complete" element={<GoogleSignupComplete />} />
      <Route path="/signup/google" element={<GoogleSignupComplete />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Legacy: role-aware forward to the real console. */}
      <Route path="/dashboard" element={<DashboardRedirect />} />

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

      <Route
        path="/citizen"
        element={
          <ProtectedRoute roles={ANY_AUTH}>
            <CitizenApp />
          </ProtectedRoute>
        }
      />

      {/* Legacy URLs whose pages were built from fabricated data. The real
          surfaces are all event-scoped, and these routes never carried an event
          id, so send them to the event picker to choose one.
          /risk           → pick an event, then its live map (real risk zones)
          /recommendations→ pick an event, then its command center (real agent proposals)
          /ai-assistant   → the assistant is a global popup, available everywhere
          /digital-twin, /incident → no real surface exists yet */}
      <Route path="/risk" element={<Navigate to="/events" replace />} />
      <Route path="/recommendations" element={<Navigate to="/events" replace />} />
      <Route path="/digital-twin" element={<Navigate to="/events" replace />} />
      <Route path="/ai-assistant" element={<Navigate to="/events" replace />} />
      <Route path="/incident" element={<Navigate to="/events" replace />} />

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

      {/* Settings (authority only) — reached from the Authority Console, which is
          the single entry point. /settings must also resolve because the sidebar
          links to it; both paths render the same settings surface. */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={["authority"]}>
            <AiProvider />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/ai-provider"
        element={
          <ProtectedRoute roles={["authority"]}>
            <AiProvider />
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
