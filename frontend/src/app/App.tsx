import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { useAuthStore } from "../features/auth/model/auth-store";
import { AuthPage } from "../pages/auth/AuthPage";
import { BuilderPage } from "../pages/builder/BuilderPage";
import { ChatFlowsPage } from "../pages/chatflows/ChatFlowsPage";
import { ConversationsPage } from "../pages/conversations/ConversationsPage";
import { ChatbotDesignPage } from "../pages/design/ChatbotDesignPage";
import { InstallChatbotPage } from "../pages/install/InstallChatbotPage";
import { KnowledgePage } from "../pages/knowledge/KnowledgePage";
import { LoginPage } from "../pages/login/LoginPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { LoadingState, ToastProvider } from "../shared/ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1 },
  },
});

function AppRoutes() {
  const status = useAuthStore((state) => state.status);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "loading") {
    return <LoadingState label="Opening workspace..." />;
  }

  const authenticated = status === "authenticated";

  return (
    <Routes>
      <Route
        path="/login"
        element={authenticated ? <Navigate to="/chatbots" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={
          authenticated ? <Navigate to="/chatbots" replace /> : <AuthPage mode="register" />
        }
      />
      <Route
        path="/chatbots"
        element={authenticated ? <ChatFlowsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/chatbots/:chatbotId/flows"
        element={authenticated ? <ChatFlowsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/chatbots/:chatbotId/design"
        element={authenticated ? <ChatbotDesignPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/chatbots/:chatbotId/install"
        element={authenticated ? <InstallChatbotPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/builder/:chatbotId?"
        element={authenticated ? <BuilderPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/conversations"
        element={authenticated ? <ConversationsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/knowledge"
        element={authenticated ? <KnowledgePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/settings"
        element={authenticated ? <SettingsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="*"
        element={<Navigate to={authenticated ? "/chatbots" : "/login"} replace />}
      />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
