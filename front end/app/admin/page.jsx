'use client'

import { useState, useEffect } from "react";
import AdminDashboard from "@/components/AdminDashboard";

// Dummy user loader for demo; replace with your auth logic
function useUser() {
  // Replace with real auth logic
  const [user, setUser] = useState(null);
  useEffect(() => {
    // Example: simulate login
    setUser({ email: "csumah1@umbc.edu", displayName: "Celestine Sumah" });
  }, []);
  return user;
}

export default function AdminPage() {
  const user = useUser();
  const [loggedIn, setLoggedIn] = useState(true);

  if (!loggedIn) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Logged Out</h2>
          <p className="mb-4">Please log in to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <AdminDashboard
      user={user}
      onLogout={() => setLoggedIn(false)}
    />
  );
}
