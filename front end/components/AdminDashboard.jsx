'use client'

import { useState } from "react";
import RouteEditor from "./RouteEditor";
import MapRoutePage from "./MapRoutePage";

const ADMIN_EMAILS = [
  "adenham112@gmail.com",
  'csumah1@umbc.edu',
  'ermichalik1106@gmail.com'
  // Add more admin emails here
];

export default function AdminDashboard({ user, onLogout }) {
  const [view, setView] = useState(null);
  const [viewKey, setViewKey] = useState(0); // Add this state

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="mb-4">You are not an administrator.</p>
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-black text-white">Logout</button>
        </div>
      </div>
    );
  }

  const switchView = (newView) => {
    setView(null); // Clear view first
    setTimeout(() => {
      setViewKey(prev => prev + 1); // Force new key
      setView(newView);
    }, 100); // Increased delay to ensure cleanup
  };

  // View is unmounted/remounted on state change, forcing fresh data loads
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
    <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Welcome, Admin!</h2>
        <p className="mb-6">You are logged in as <span className="font-mono">{user.email}</span></p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => switchView("edit")}
            className="px-5 py-3 rounded-lg bg-amber-400 text-black font-semibold hover:bg-amber-300"
          >
            Edit Routes
          </button>
          <button
            onClick={() => switchView("user")}
            className="px-5 py-3 rounded-lg bg-black text-white font-semibold hover:bg-gray-800"
          >
            User View
          </button>
        </div>
        <button
          onClick={onLogout}
          className="mt-6 px-4 py-2 rounded-lg bg-gray-200 text-black"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
