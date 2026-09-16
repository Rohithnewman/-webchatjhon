import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useMe } from "../entities/me/api";
import { useAuthStore } from "../entities/session/auth-store";
import { AdminPage } from "../pages/admin/AdminPage";
import { AnalyticsPage } from "../pages/analytics/AnalyticsPage";
import { AuthPage } from "../pages/auth/AuthPage";
import { BuilderPage } from "../pages/builder/BuilderPage";
import { ChatFlowsPage } from "../pages/chatflows/ChatFlowsPage";
import { ConversationsPage } from "../pages/conversations/ConversationsPage";
import { ChatbotDesignPage } from "../pages/design/ChatbotDesignPage";
import { InstallChatbotPage } from "../pages/install/InstallChatbotPage";
import { KnowledgePage } from "../pages/knowledge/KnowledgePage";
import { LoginPage } from "../pages/login/LoginPage";
import { SubscriptionLockedPage } from "../pages/locked/SubscriptionLockedPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { LoadingState, ToastProvider } from "../shared/ui";

/** Where an authenticated user lands: superadmins have no tenancy so they go
 *  straight to the admin console, everyone else to their chatbots. Used for
 *  `/`, the authenticated branch of `/login` and `/register`, and the
 *  catch-all route. While `/auth/me` is still resolving it renders a loading
 *  state instead of guessing, to avoid a flash to the wrong destination. */
function HomeRedirect() {
  const { me, isReady } = useMe();
  if (!isReady) return <LoadingState label="Opening workspace..." />;
  return <Navigate to={me?.is_superadmin ? "/admin" : "/chatbots"} replace />;
}

/** Wraps every tenant-facing route element (everything except /admin, /login
 *  and /register). Superadmins carry no tenancy, so any tenant route they
 *  land on — directly, via a stale link, or via browser back — bounces them
 *  to /admin instead of rendering. While `/auth/me` is still resolving it
 *  renders a loading state rather than the real page, so a superadmin never
 *  mounts tenant-only queries (which 403) before being redirected. */
function SuperadminOnly({ children }: { children: ReactNode }) {
  const { me, isReady } = useMe();
  if (!isReady) return <LoadingState label="Opening workspace..." />;
  if (me?.is_superadmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/** Wraps every routed page. Once `/auth/me` resolves, a non-superadmin whose
 *  organisation is suspended or expired sees the lock screen instead of the
 *  route they asked for — except on /login and /register, which never need
 *  it (an authenticated user there is redirected away by its own route, and
 *  an anonymous one has no `me` to check). Superadmins bypass so they can
 *  still reach /admin to fix the subscription. While `!isReady` (still
 *  loading, or no session) routes render normally to avoid a flash. */
function LockedGuard({ children }: { children: ReactNode }) {
  const { me, isReady } = useMe();
  const location = useLocation();
  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";

  if (isAuthRoute || !isReady || !me) return <>{children}</>;
  const locked = !me.is_superadmin && me.subscription && me.subscription.effective_status !== "active";
  return locked ? <SubscriptionLockedPage /> : <>{children}</>;
}

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
    <LockedGuard>
      <Routes>
        <Route path="/" element={authenticated ? <HomeRedirect /> : <Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={authenticated ? <HomeRedirect /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={
            authenticated ? <HomeRedirect /> : <AuthPage mode="register" />
          }
        />
        <Route
          path="/chatbots"
          element={
            authenticated ? (
              <SuperadminOnly><ChatFlowsPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/chatbots/:chatbotId/flows"
          element={
            authenticated ? (
              <SuperadminOnly><ChatFlowsPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/chatbots/:chatbotId/design"
          element={
            authenticated ? (
              <SuperadminOnly><ChatbotDesignPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/chatbots/:chatbotId/install"
          element={
            authenticated ? (
              <SuperadminOnly><InstallChatbotPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/builder/:chatbotId?"
          element={
            authenticated ? (
              <SuperadminOnly><BuilderPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/conversations"
          element={
            authenticated ? (
              <SuperadminOnly><ConversationsPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/knowledge"
          element={
            authenticated ? (
              <SuperadminOnly><KnowledgePage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            authenticated ? (
              <SuperadminOnly><SettingsPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/analytics"
          element={
            authenticated ? (
              <SuperadminOnly><AnalyticsPage /></SuperadminOnly>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={authenticated ? <AdminPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={authenticated ? <HomeRedirect /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </LockedGuard>
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
