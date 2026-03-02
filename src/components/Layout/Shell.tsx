import { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getModules } from "../../lib/module-registry";
import Sidebar from "./Sidebar";

export default function Shell() {
  const modules = getModules();
  const defaultRoute = modules[0]?.route ?? "/";

  return (
    <div className="flex h-screen bg-bg-primary">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-text-secondary">
              Loading...
            </div>
          }
        >
          <Routes>
            {modules.map((mod) => (
              <Route key={mod.id} path={mod.route} element={<mod.component />} />
            ))}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
