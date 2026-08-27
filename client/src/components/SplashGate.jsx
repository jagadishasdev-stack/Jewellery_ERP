/**
 * SplashGate — shown once, right after a real login (never on a plain page
 * refresh — see authStore.js's justLoggedIn, which only a login() call
 * sets true and is deliberately excluded from persisted state).
 *
 * Two phases:
 *  1. "splash" — a short, branded animated screen (logo, gradient, tagline),
 *     auto-advances after SPLASH_DURATION_MS.
 *  2. "idle" — a deliberately plain, mostly-empty screen (just the logo,
 *     faded) with a soft "press any key to continue" hint. Waits for a
 *     keydown, click, or touch anywhere before revealing the real app.
 *
 * Renders as a fixed full-viewport overlay on top of everything (including
 * the sidebar/header) so it reads as a genuine welcome moment, not just a
 * loading spinner inside the content area.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUiThemeStore } from '../store/uiThemeStore';

const SPLASH_DURATION_MS = 2200;

export default function SplashGate() {
  const justLoggedIn = useAuthStore((s) => s.justLoggedIn);
  const dismissSplash = useAuthStore((s) => s.dismissSplash);
  const user = useAuthStore((s) => s.user);
  const theme = useUiThemeStore((s) => s.theme);
  const logoUrl = theme?.Logo_URL || '/logo.png';

  const [phase, setPhase] = useState('splash'); // 'splash' | 'idle'
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);

  // Reset to phase 1 every time a fresh login actually happens.
  useEffect(() => {
    if (justLoggedIn) {
      setPhase('splash');
      setLeaving(false);
      timerRef.current = setTimeout(() => setPhase('idle'), SPLASH_DURATION_MS);
    }
    return () => clearTimeout(timerRef.current);
  }, [justLoggedIn]);

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    // Let the fade-out transition finish before actually unmounting/
    // clearing state, so it never just pops away.
    setTimeout(() => dismissSplash(), 260);
  };

  // Phase 2 only: any key, click, or touch dismisses.
  useEffect(() => {
    if (!justLoggedIn || phase !== 'idle') return;
    const onKey = () => dismiss();
    const onClick = () => dismiss();
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('touchstart', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('touchstart', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justLoggedIn, phase]);

  if (!justLoggedIn) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: phase === 'splash'
          ? 'radial-gradient(circle at 50% 40%, #2a2415 0%, #1A1A1A 60%, #0d0d0d 100%)'
          : '#141414',
        transition: 'opacity 0.26s ease, background 0.6s ease',
        opacity: leaving ? 0 : 1,
      }}
    >
      {phase === 'splash' ? (
        <div style={{ textAlign: 'center', animation: 'splashLogoIn 0.7s cubic-bezier(.2,.8,.2,1)' }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%', margin: '0 auto 24px',
            background: 'linear-gradient(135deg, #B8860B, #D4A017)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 60px rgba(212,160,23,.45)',
            animation: 'splashPulse 2.2s ease-in-out infinite',
          }}>
            <img src={logoUrl} alt="Logo" style={{ width: 72, height: 72, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
            Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}
          </div>
          <div style={{ fontSize: 13, color: '#D4A017', marginTop: 6, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {user?.companyName || 'Jewellery ERP'}
          </div>
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: '#D4A017',
                animation: `splashDot 1.2s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
        </div>
      ) : (
        // Phase 2 — deliberately plain/empty, just a faded mark and a hint.
        <div style={{ textAlign: 'center', animation: 'splashFadeIn 0.5s ease' }}>
          <img src={logoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'contain', opacity: 0.35, marginBottom: 28 }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase', animation: 'splashHintPulse 1.8s ease-in-out infinite' }}>
            Press any key to continue
          </div>
        </div>
      )}

      <style>{`
        @keyframes splashLogoIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes splashPulse { 0%, 100% { box-shadow: 0 0 60px rgba(212,160,23,.45); } 50% { box-shadow: 0 0 90px rgba(212,160,23,.7); } }
        @keyframes splashDot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
        @keyframes splashFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes splashHintPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
      `}</style>
    </div>
  );
}
