'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'

export default function SplashScreen({ onLogin, onGuest, authError, isAuthenticating }) {
  const prefersReducedMotion = useReducedMotion()

  // Accessibility prefs (shared app-wide via localStorage)
  const [highContrast, setHighContrast] = useState(false)
  const [textScale, setTextScale] = useState(1)

  // Footer modals: 'how' | 'a11y' | 'settings' | 'privacy' | 'terms' | null
  const [open, setOpen] = useState(null)

  // Load persisted prefs on mount
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem('letsleave:prefs') || '{}')
    if (typeof prefs.highContrast === 'boolean') setHighContrast(prefs.highContrast)
    if (typeof prefs.textScale === 'number') setTextScale(prefs.textScale)
  }, [])

  // Persist prefs when changed
  useEffect(() => {
    const prefs = JSON.parse(localStorage.getItem('letsleave:prefs') || '{}')
    localStorage.setItem('letsleave:prefs', JSON.stringify({ ...prefs, highContrast, textScale }))
  }, [highContrast, textScale])

  const brand = useMemo(
    () => ({
      gold: '#FFCB05',
      black: '#000000',
      ink: '#111111',
      white: '#FFFFFF',
    }),
    []
  )

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-x-hidden"
      style={{
        backgroundColor: brand.gold,
        fontSize: `calc(16px * ${textScale})`,
        filter: highContrast ? 'contrast(1.12) saturate(1.05)' : undefined,
      }}
      role="document"
      aria-label="Welcome to Let&apos;s Leave"
    >
      {/* Top bar */}
      <header className="relative z-10 w-full flex items-center justify-between px-8 py-4">
        <h1 className="sr-only">Let&apos;s Leave</h1>

        {/* Mobile-only auth buttons */}
        <nav className="ml-auto flex items-center gap-3 lg:hidden">
          <button
            onClick={onLogin}
            disabled={isAuthenticating}
            className="px-4 py-2 rounded-xl font-semibold border focus:outline-none focus-visible:ring-4 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: brand.black, borderColor: '#2b2b2b', color: brand.gold }}
          >
            {isAuthenticating ? 'Signing in...' : 'Log in'}
          </button>
          <button
            onClick={onGuest}
            className="px-4 py-2 rounded-xl font-semibold border focus:outline-none focus-visible:ring-4"
            style={{ backgroundColor: brand.gold, borderColor: '#ffffff80', color: brand.black }}
          >
            Continue as guest
          </button>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10 py-8 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left: Title + CTA */}
            <div className="text-center lg:text-left">
              <motion.h2
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="font-extrabold tracking-tight drop-shadow-[0_2px_0_rgba(0,0,0,0.25)]"
                style={{ fontSize: 'clamp(36px, 5vw, 72px)', color: brand.black }}
              >
                Welcome to Let’s Leave!
              </motion.h2>

              <motion.p
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={prefersReducedMotion ? undefined : { opacity: 0.95, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                className="mt-3 font-medium"
                style={{ color: '#1A1A1A' }}
              >
                Your guide to accessible routes around UMBC.
              </motion.p>

              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
                className="mt-8 inline-flex flex-col sm:flex-row gap-4 sm:gap-3"
                aria-label="Get started"
              >
                <button
                  onClick={onLogin}
                  disabled={isAuthenticating}
                  className="px-6 py-3 rounded-2xl font-semibold shadow-lg focus:outline-none focus-visible:ring-4 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: brand.black, color: brand.gold, border: '1px solid #2b2b2b' }}
                >
                  {isAuthenticating ? 'Signing in...' : 'Log in'}
                </button>
                <button
                  onClick={onGuest}
                  className="px-6 py-3 rounded-2xl font-semibold shadow-lg focus:outline-none focus-visible:ring-4"
                  style={{ backgroundColor: brand.gold, color: brand.black, border: '1px solid #ffffff80' }}
                >
                  Continue as guest
                </button>
              </motion.div>

              {authError && (
                <p
                  role="alert"
                  className="mt-3 inline-flex rounded-2xl px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: '#fffdf5', color: '#8b0000', border: '1px solid #f3d2ab' }}
                >
                  {authError}
                </p>
              )}

              <p className="mt-3 text-sm opacity-80" style={{ color: '#1A1A1A' }}>
                You can explore as a guest—no account needed.
              </p>
            </div>

            {/* Right: Mascot */}
            <motion.div
              className="justify-self-center lg:justify-self-end"
              initial={prefersReducedMotion ? false : { scale: 0.96, opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
            >
              <Image
                src="/assets/umbc-retriever.png"
                alt="UMBC Retriever mascot"
                className="w-[460px] max-w-[40vw] drop-shadow-xl h-auto"
                width={1200}
                height={1052}
                priority
              />
            </motion.div>
          </div>
        </div>
      </main>

      {/* Gold ribbon separator */}
      <div
        aria-hidden
        className="relative z-10 w-full"
        style={{
          height: '8px',
          background: `linear-gradient(90deg, ${brand.gold} 0%, #ffd74d 35%, ${brand.gold} 70%, #ffc700 100%)`,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
        }}
      />

      {/* Clean footer */}
      <footer
        className="relative text-white"
        style={{
          background: 'linear-gradient(180deg, #121212 0%, #0f0f0f 60%, #0a0a0a 100%)',
          boxShadow: '0 -1px 0 rgba(255,203,5,0.6) inset, 0 -10px 30px rgba(0,0,0,0.35) inset',
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Left: Brand + links (now buttons that open modals, layout preserved) */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.gold }} />
                <span className="text-sm font-semibold tracking-wide opacity-90">Let’s Leave</span>
              </div>

              <button
                onClick={() => setOpen('how')}
                className="text-sm opacity-85 hover:opacity-100 hover:underline underline-offset-4 decoration-[2px]"
                style={{ textDecorationColor: brand.gold }}
              >
                How it works
              </button>
              <button
                onClick={() => setOpen('a11y')}
                className="text-sm opacity-85 hover:opacity-100 hover:underline underline-offset-4 decoration-[2px]"
                style={{ textDecorationColor: brand.gold }}
              >
                Accessibility
              </button>
              <button
                onClick={() => setOpen('settings')}
                className="text-sm opacity-85 hover:opacity-100 hover:underline underline-offset-4 decoration-[2px]"
                style={{ textDecorationColor: brand.gold }}
              >
                Settings
              </button>
            </div>

            {/* Right: Legal (wired to simple modals) */}
            <div className="flex items-center gap-4 text-sm opacity-80 flex-wrap">
              <button
                onClick={() => setOpen('privacy')}
                className="hover:opacity-100 hover:underline underline-offset-4 decoration-[2px]"
                style={{ textDecorationColor: brand.gold }}
              >
                Privacy
              </button>
              <span aria-hidden>•</span>
              <button
                onClick={() => setOpen('terms')}
                className="hover:opacity-100 hover:underline underline-offset-4 decoration-[2px]"
                style={{ textDecorationColor: brand.gold }}
              >
                Terms
              </button>
              <span aria-hidden>•</span>
              <span>v1.0</span>
              <span aria-hidden>•</span>
              <span>© {new Date().getFullYear()} UMBC</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>
        {open === 'how' && (
          <Modal title="How it works" onClose={() => setOpen(null)} brand={brand}>
            <ul className="list-disc pl-5 space-y-2">
              <li>Pick a start and destination on the next screen.</li>
              <li>We prioritize step-free, accessible paths.</li>
              <li>Resize map/directions with the center handle.</li>
              <li>Save frequently used routes to reuse later.</li>
              <li>
                <strong>Tip:</strong> Add a <em>room number after a building</em> (e.g., “Engineering 236”)
                and we’ll route you to the <strong>correct floor</strong> of that building.
              </li>
            </ul>
          </Modal>
        )}

        {open === 'a11y' && (
          <Modal title="Accessibility" onClose={() => setOpen(null)} brand={brand}>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span>High contrast</span>
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={(e) => setHighContrast(e.target.checked)}
                />
              </label>

              <div>
                <div className="mb-2">Text size</div>
                <div className="flex gap-2">
                  {[1, 1.1, 1.25].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTextScale(s)}
                      className={`px-3 py-2 rounded-lg border ${
                        textScale === s
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                      }`}
                    >
                      {s === 1 ? '100%' : s === 1.1 ? '110%' : '125%'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
        )}

        {open === 'settings' && (
          <Modal title="Settings" onClose={() => setOpen(null)} brand={brand}>
            <div className="space-y-3">
              <button
                onClick={() => {
                  localStorage.removeItem('letsleave:prefs')
                  setHighContrast(false)
                  setTextScale(1)
                }}
                className="px-3 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20"
              >
                Reset accessibility preferences
              </button>
              <p className="text-sm opacity-80">
                Tip: You can access these preferences on any page from the footer.
              </p>
            </div>
          </Modal>
        )}

        {/* Simple proof-of-functionality modals for Privacy & Terms */}
        {open === 'privacy' && (
          <Modal title="Privacy" onClose={() => setOpen(null)} brand={brand}>
            <p className="opacity-90">
              This is a demo modal to show the Privacy button works. In the final app,
              this will outline how we handle your data. For the Hi-Fi, no real data is collected.
            </p>
          </Modal>
        )}
        {open === 'terms' && (
          <Modal title="Terms" onClose={() => setOpen(null)} brand={brand}>
            <p className="opacity-90">
              This is a demo modal to show the Terms button works. In the final app,
              this will summarize acceptable use and limitations. For now, it’s just a placeholder.
            </p>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

/* Reusable centered modal */
function Modal({ title, children, onClose, brand }) {
  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed z-[100] rounded-2xl shadow-xl p-6 w-[92vw] max-w-[560px] border-2 text-white"
        style={{
          background: '#0b0b0b',
          borderColor: brand.gold,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="hover:opacity-80" aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
      </motion.div>
    </>
  )
}
