import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl px-xl py-2xl">
        <Outlet />
      </main>
    </div>
  );
}
