'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import SplashScreen from '@/components/SplashScreen'
import MapRoutePage from '@/components/MapRoutePage'
import { auth, googleProvider } from '@/lib/firebaseClient'

export default function HomePage() {
  const [view, setView] = useState('splash')
  const [currentUser, setCurrentUser] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (user) {
        setView('map')
      }
    })

    return () => unsubscribe()
  }, [])

  const handleLogin = useCallback(async () => {
    setAuthError(null)
    setIsAuthenticating(true)

    try {
      const result = await signInWithPopup(auth, googleProvider)
      const email = result.user.email;

      if (!email.endsWith("@umbc.edu")) {
        console.log("Non-UMBC email detected:", email);
        // Sign them out, block access, or redirect
        await auth.signOut();
        setAuthError("Access denied: must use a UMBC email.");
        return;
        // Redirect back to login page with error message
        //const errorMessage = encodeURIComponent("Your login email must be a UMBC email.");
        //window.location.href = `/login?error=${errorMessage}`;
        return;
        //throw new Error("Access denied: must use a UMBC email.");
        //setAuthError("Access denied: must use a UMBC email.");
        //setIsAuthenticating(false);
        //setCurrentUser(null);
        //SsetAuthError(null)
    }
    else{
       // continue with your app...
      setCurrentUser(result.user)
      setView('map')
    }
     
    } catch (error) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        setAuthError(error?.message || 'Something went wrong signing you in.')
      }
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  const handleGuest = useCallback(() => {
    setAuthError(null)
    setCurrentUser(null)
    setView('map')
  }, [])

  const handleBackToSplash = useCallback(async () => {
    setView('splash')
    setCurrentUser(null)
    setAuthError(null)
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Failed to sign out', error)
    }
  }, [])

  if (view === 'map') {
    return <MapRoutePage user={currentUser} onBackToSplash={handleBackToSplash} />
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
