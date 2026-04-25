import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./lib/auth";
import { AppShell } from "./components/shell/AppShell";

import LoginRoute from "./routes/login";
import HomeRoute from "./routes/home";
import InspectionsRoute from "./routes/inspections";
import InspectionDetailRoute from "./routes/inspection-detail";
import VarietiesRoute from "./routes/varieties";
import BatchesRoute from "./routes/batches";
import ReportsRoute from "./routes/reports";
import SettingsRoute from "./routes/settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      >
        <Route path="/" element={<HomeRoute />} />
        <Route path="/inspections" element={<InspectionsRoute />} />
        <Route path="/inspections/:id" element={<InspectionDetailRoute />} />
        <Route path="/varieties" element={<VarietiesRoute />} />
        <Route path="/batches" element={<BatchesRoute />} />
        <Route path="/reports" element={<ReportsRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
