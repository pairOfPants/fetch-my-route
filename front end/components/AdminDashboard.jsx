'use client';

import { useState } from "react";
import RouteEditor from "./RouteEditor";
import MapRoutePage from "./MapRoutePage";
import { Shield, Map, Edit3, LogOut } from "lucide-react";

const ADMIN_EMAILS = [
  "adenham112@gmail.com",
  "csumah1@umbc.edu",
  // Add more admin emails here
];

export default function AdminDashboard({ user, onLogout }) {
  const [view, setView] = useState(null);
  const [viewKey, setViewKey] = useState(0);

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="min-h-screen w-screen bg-gradient-to-b from-black via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="relative max-w-md w-full rounded-2xl bg-slate-900/80 border border-slate-700/70 shadow-2xl p-8 text-center">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2">
            <div className="inline-flex items-center justify-center rounded-full bg-red-500/90 text-white p-3 shadow-lg shadow-red-500/40">
              <Shield className="w-6 h-6" />
            </div>
          </div>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            This area is reserved for route administrators. If you think this is a mistake,
            try logging in with a different account.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {user?.email && (
              <div className="text-xs text-slate-400">
                Logged in as{" "}
                <span className="font-mono text-amber-300">
                  {user.email}
                </span>
              </div>
            )}
            <button
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium px-4 py-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  const switchView = (newView) => {
    setView(null);
    setTimeout(() => {
      setViewKey((prev) => prev + 1);
      setView(newView);
    }, 100);
  };

  if (view === "edit") {
    return (
      <RouteEditor
        key={`route-editor-${viewKey}`}
        isAdmin
        onGoToUserView={() => switchView("user")}
      />
    );
  }

  if (view === "user") {
    return (
      <MapRoutePage
        key={`map-route-page-${viewKey}`}
        user={user}
        isAdmin
        onBackToSplash={onLogout}
        onGoToEditRoutes={() => switchView("edit")}
      />
    );
  }

  // Landing screen
  return (
    <div className="min-h-screen w-screen bg-gradient-to-b from-black via-slate-900 to-slate-950 text-white flex flex-col">
      {/* Soft radial glow behind content */}
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-amber-400 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-emerald-500 blur-3xl opacity-60" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 border-b border-slate-800/70 bg-black/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-black shadow-md">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">
                UMBC Route Admin
              </h1>
              <span className="rounded-full bg-amber-400/10 border border-amber-400/40 text-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Admin
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manage campus paths and test the student view.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs text-slate-400">Signed in as</span>
            <span className="text-xs font-mono text-amber-200 truncate max-w-[210px]">
              {user.email}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800 hover:border-slate-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 px-4 sm:px-8 py-6 flex items-center justify-center">
        <div className="max-w-5xl w-full grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* Left: primary actions */}
          <section className="rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-2xl shadow-black/40 p-6 sm:p-8 backdrop-blur">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                  Welcome, Admin!
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Use this dashboard to edit walking routes on campus and preview
                  what students will see in the navigation experience.
                </p>
              </div>
              <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg shadow-amber-400/40">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Edit Routes card */}
              <button
                type="button"
                onClick={() => switchView("edit")}
                className="group flex flex-col items-start justify-between rounded-2xl border border-amber-400/60 bg-gradient-to-br from-amber-400 to-amber-300 text-black px-4 py-4 sm:px-5 sm:py-5 shadow-lg shadow-amber-400/40 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-400/50 transition transform text-left"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/10">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide">
                        Edit Routes
                      </h3>
                      <p className="text-xs text-black/70">
                        Adjust path geometry, add new segments, or remove outdated ones.
                      </p>
                    </div>
                  </div>
                </div>
                <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  Open Route Editor
                  <span className="inline-block h-px w-6 bg-black/70 group-hover:w-10 transition-all" />
                </span>
              </button>

              {/* User View card */}
              <button
                type="button"
                onClick={() => switchView("user")}
                className="group flex flex-col items-start justify-between rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 sm:px-5 sm:py-5 hover:bg-slate-800/90 hover:border-slate-500/80 hover:-translate-y-0.5 transition transform text-left"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800">
                      <Map className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide">
                        User View
                      </h3>
                      <p className="text-xs text-slate-300">
                        Jump into the map experience to verify routing and instructions.
                      </p>
                    </div>
                  </div>
                </div>
                <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200">
                  Preview Navigation
                  <span className="inline-block h-px w-6 bg-amber-300 group-hover:w-10 transition-all" />
                </span>
              </button>
            </div>

            <p className="mt-6 text-[11px] text-slate-400">
              Changes you make in the <span className="font-semibold text-amber-200">Route Editor</span> are
              stored in the backend and used by the main routing engine. Always walk
              critical paths in person before deploying to students.
            </p>
          </section>

          {/* Right: helper panel */}
          <aside className="rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-xl shadow-black/40 p-5 sm:p-6 backdrop-blur">
            <h3 className="text-sm font-semibold text-slate-100 tracking-tight">
              Quick Tips
            </h3>
            <p className="mt-2 text-xs text-slate-300">
              Keep the campus map accurate and easy to use.
            </p>

            <ul className="mt-4 space-y-3 text-xs text-slate-300">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                  1
                </span>
                <span>
                  Use <span className="font-semibold text-amber-200">Edit Routes</span> to adjust paths,
                  especially for construction detours or new walkways.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                  2
                </span>
                <span>
                  After editing, switch to <span className="font-semibold text-amber-200">User View</span> and
                  run a sample route to confirm everything feels smooth.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold">
                  3
                </span>
                <span>
                  Keep accessibility in mind: avoid routes that include stairs where possible and favor
                  ramps and elevators for default paths.
                </span>
              </li>
            </ul>

            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-[11px] text-slate-300">
              <p>
                You&apos;re currently in the{" "}
                <span className="font-semibold text-amber-200">
                  Admin Dashboard
                </span>
                . Use the big cards on the left to jump straight into editing or testing.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
