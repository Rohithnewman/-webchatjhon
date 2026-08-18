import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { useAuthStore } from "../features/auth/model/auth-store";
import { AuthPage } from "../pages/auth/AuthPage";
import { BuilderPage } from "../pages/builder/BuilderPage";
import { KnowledgePage } from "../pages/knowledge/KnowledgePage";
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
    return <LoadingState label="Opening builder" />;
  }

  const authenticated = status === "authenticated";

  return (
    <Routes>
      <Route
        path="/login"
        element={authenticated ? <Navigate to="/builder" replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/register"
        element={
          authenticated ? <Navigate to="/builder" replace /> : <AuthPage mode="register" />
        }
      />
      <Route
        path="/builder/:chatbotId?"
        element={authenticated ? <BuilderPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/knowledge" element={authenticated ? <KnowledgePage /> : <Navigate to="/login" replace />} />
      <Route
        path="*"
        element={<Navigate to={authenticated ? "/builder" : "/login"} replace />}
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
