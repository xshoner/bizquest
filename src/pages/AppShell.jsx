import { Outlet } from "react-router-dom";

export default function AppShell() {
  return (
    <main className="app-stage min-h-screen text-slate-950">
      <Outlet />
    </main>
  );
}
