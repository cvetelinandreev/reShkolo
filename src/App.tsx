import { Suspense } from "react";
import { Outlet } from "react-router";
import "./App.css";

export function App() {
  return (
    <main className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-neutral-50 text-neutral-800">
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6 text-neutral-500">
            Loading…
          </div>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </Suspense>
    </main>
  );
}
