import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: "#0f172a", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
        }}
      />
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
