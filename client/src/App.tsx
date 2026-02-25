import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import AppLayout from "./components/AppLayout.tsx";
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
  {
    path: "/suivi/:token",
    element: <TrackingPage />,
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
