import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import AppLayout from "./components/AppLayout.tsx";
import RequireAuth from "./components/RequireAuth.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import ProjectsPage from "./pages/ProjectsPage.tsx";
import ProjectDetailPage from "./pages/ProjectDetailPage.tsx";
import AnomaliesPage from "./pages/AnomaliesPage.tsx";
import RulesPage from "./pages/RulesPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import TrackingPage from "./pages/TrackingPage.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  // ── Routes publiques — sans authentification ──────────────────────────────
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/suivi/:token",
    element: <TrackingPage />,
  },
  // ── Routes opérateur — protégées par RequireAuth (JWT cookie) ─────────────
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/", element: <ProjectsPage /> },
          { path: "/projects/:id", element: <ProjectDetailPage /> },
          { path: "/anomalies", element: <AnomaliesPage /> },
          { path: "/rules", element: <RulesPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
