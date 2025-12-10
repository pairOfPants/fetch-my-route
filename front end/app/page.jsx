'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import SplashScreen from '@/components/SplashScreen'
import MapRoutePage from '@/components/MapRoutePage'
import AdminDashboard from '@/components/AdminDashboard'
import { auth, googleProvider } from '@/lib/firebaseClient'

const NON_UMBC_ERROR_MESSAGE =
  'Retriever Alert 🐾 This app is for UMBC accounts only. Please sign in with your official @umbc.edu email.'

const ADMIN_EMAILS = [
  'adenham112@gmail.com',
  // Add more admin emails here if needed
]

export default function HomePage() {
  const [view, setView] = useState('splash')
  const [currentUser, setCurrentUser] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Track auth state and enforce @umbc.edu even if user was logged in from another tab/session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const email = (user.email || '').toLowerCase()
        const isUmbcEmail = email.endsWith('@umbc.edu')
        const isAdmin = ADMIN_EMAILS.includes(email)

        if (!isUmbcEmail && !isAdmin) {
          // Immediately sign out users who are not using a umbc.edu email or admin
          signOut(auth).catch((err) => {
            console.error('Error signing out non-UMBC user from auth state change:', err)
          })
          setCurrentUser(null)
          setAuthError(NON_UMBC_ERROR_MESSAGE)
          setView('splash')
        } else {
          setCurrentUser(user)
          setAuthError(null)
          // If they authenticated successfully and we're still on splash, move to map
          setView((prev) => (prev === 'splash' ? 'map' : prev))
        }
      } else {
        setCurrentUser(null)
      }
      setIsAuthenticating(false)
    })

    return () => unsubscribe()
  }, [])

  const handleLogin = useCallback(async () => {
    setAuthError(null)
    setIsAuthenticating(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user
      const email = (user.email || '').toLowerCase()
      const isUmbcEmail = email.endsWith('@umbc.edu')
      const isAdmin = ADMIN_EMAILS.includes(email)

      if (!isUmbcEmail && !isAdmin) {
        // Not a umbc.edu email or admin → sign them out and show an UMBC-themed error "pushback"
        await signOut(auth).catch((err) => {
          console.error('Error signing out non-UMBC user after popup:', err)
        })
        setCurrentUser(null)
        setAuthError(NON_UMBC_ERROR_MESSAGE)
        setView('splash')
      } else {
        setCurrentUser(user)
        setAuthError(null)
        setView('map')
      }
    } catch (err) {
      console.error('Login error:', err)
      // If the popup was just closed by the user, don't show a scary error
      if (err && err.code === 'auth/popup-closed-by-user') {
        setAuthError(null)
      } else {
        setAuthError('Sign-in failed. Please try again.')
      }
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  const handleGuest = useCallback(() => {
    // Guest mode: no auth required, just go to the map
    setCurrentUser(null)
    setAuthError(null)
    setView('map')
  }, [])

  const handleBackToSplash = useCallback(async () => {
    // Called from MapRoutePage when the user taps the logout / back button
    try {
      if (currentUser) {
        await signOut(auth)
      }
    } catch (err) {
      console.error('Error during sign-out:', err)
    } finally {
      setCurrentUser(null)
      setAuthError(null)
      setView('splash')
    }
  }, [currentUser])

  if (view === 'map') {
    // Show admin dashboard if admin, else regular map
    const email = currentUser?.email?.toLowerCase() || '';
    const isAdmin = ADMIN_EMAILS.includes(email);
    if (isAdmin) {
      return (
        <AdminDashboard
          key="admin-dashboard"
          user={currentUser}
          onLogout={handleBackToSplash}
        />
      );
    }
    return (
      <MapRoutePage 
        key="map-route-page"
        user={currentUser} 
        onBackToSplash={handleBackToSplash} 
        isAdmin={isAdmin}
        onGoToEditRoutes={() => {
          // Switch to admin view
          setView('admin');
        }}
      />
    );
  }

  return (
    <SplashScreen
      onLogin={handleLogin}
      onGuest={handleGuest}
      authError={authError}
      isAuthenticating={isAuthenticating}
    />
  )
}
