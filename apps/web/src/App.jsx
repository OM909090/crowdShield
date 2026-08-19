import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { AssistantProvider } from "./context/AssistantContext";
import AppRoutes from "./routes/AppRoutes";
import AssistantChat from "./components/assistant/AssistantChat";
import AccountMenu from "./components/AccountMenu";

function App() {
  return (
    <AuthProvider>
      {/* Wraps both the routes and the popup: the assistant lives outside the
          route tree, so a page needs this channel to tell it which event the
          person is at and where they are standing. */}
      <AssistantProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: "#0f172a", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
          }}
        />
        <AppRoutes />
        {/* Outside the route tree for the same reason as the assistant: there is
            no shared layout, so mounting it per page would mean editing every
            page and still missing one. */}
        <AccountMenu />
        <AssistantChat />
      </AssistantProvider>
    </AuthProvider>
  );
}

export default App;
