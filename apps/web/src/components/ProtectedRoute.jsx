import { Navigate, useLocation } from "react-router-dom";
import { Radar } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    // Logged in, but the wrong role for this route — send them to their own home
    const fallback = user.role === "authority" ? "/authority/events" : user.role === "admin" ? "/admin/verify-authorities" : "/events";
    return <Navigate to={fallback} replace />;
  }

  return children;
}
