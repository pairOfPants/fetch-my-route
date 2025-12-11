'use client'

import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import SplashScreen from '@/components/SplashScreen'
import MapRoutePage from '@/components/MapRoutePage'
import { auth, googleProvider } from '@/lib/firebaseClient'

const NON_UMBC_ERROR_MESSAGE =
  'Retriever Alert 🐾 This app is for UMBC accounts only. Please sign in with your official @umbc.edu email.'

<<<<<<< Updated upstream
=======
const ADMIN_EMAILS = [
  'adenham112@gmail.com',
  'csumah1@umbc.edu'
  // Add more admin emails here if needed
]

>>>>>>> Stashed changes
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

        if (!isUmbcEmail) {
          // Immediately sign out users who are not using a umbc.edu email
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

      if (!isUmbcEmail) {
        // Not a umbc.edu email → sign them out and show an UMBC-themed error "pushback"
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
