import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./pages/AppShell.jsx";
import "./styles.css";

const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const StudentPage = lazy(() => import("./pages/StudentPage.jsx"));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="p-8 text-sm font-bold text-slate-500">화면을 불러오는 중입니다.</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<AdminPage />} />
            <Route path="/settings.html" element={<SettingsPage />} />
            <Route path="/admin/:roomId" element={<AdminPage />} />
            <Route path="/room/:roomId" element={<StudentPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
