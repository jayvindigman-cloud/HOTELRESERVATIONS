import { API_BASE, accountFetch, readJson } from "./hotel-api";
import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Display from './components/AdminDashboard.jsx'
import LoginModal from "./components/LoginModal.jsx";
import HotelInfo from './components/HotelInfo.jsx'
import { auth, db, googleProvider } from './Firebase.js'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState("")
  const [verificationBusy, setVerificationBusy] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [authError, setAuthError] = useState('')

  useEffect(() => onAuthStateChanged(auth, (current) => {
    setProfile(null)
    setUser(current)
    setVerified(Boolean(current?.emailVerified))
    setLoading(Boolean(current?.emailVerified))
  }), [])

  useEffect(() => {
    if (!user || !verified) return
    let active = true

    async function loadProfile() {
      try {
        const userRef = doc(db, 'users', user.uid)
        const snapshot = await getDoc(userRef)
        if (!active) return

        let data = snapshot.data()
        if (!snapshot.exists()) {
          data = {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Guest',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: 'customer',
            createdAt: serverTimestamp(),
          }
          await setDoc(userRef, data)
        }

        const role = String(data.role || '').toLowerCase()
        if (!['customer', 'admin'].includes(role)) throw new Error('Invalid account role')
        if (active) setProfile({ ...data, uid: user.uid, email: user.email || data.email || '', role })
      } catch (error) {
        if (!active) return
        console.error('Unable to load the account profile:', error)
        setAuthError('Unable to load your account. Sign in again to retry.')
        await signOut(auth).catch(() => {})
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProfile()
    return () => { active = false }
  }, [user, verified])

  useEffect(() => {
    if (!user?.emailVerified || profile?.role !== "customer") return;
    const controller = new AbortController();
    accountFetch(API_BASE + "/guest/directory-profile", {
      method: "PUT", signal: controller.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: profile.name, photoURL: profile.photoURL }),
    }).catch(() => {});
    return () => controller.abort();
  }, [user, profile]);

  useEffect(() => {
    if (!user || verified) return;
    const controller = new AbortController();
    fetch(API_BASE + "/signup-verification", { signal: controller.signal }).then(readJson)
      .then(({ method }) => { if (!controller.signal.aborted) setVerificationMethod(method); })
      .catch(() => { if (!controller.signal.aborted) setVerificationMethod("link"); });
    return () => controller.abort();
  }, [user, verified]);

  function requestVerification(action, body) {
    return accountFetch(API_BASE + "/signup-verification/" + action, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(readJson);
  }

  async function handleLogin(email, password) {
    setAuthError('')
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }

  async function handleGoogleLogin() {
    setAuthError('')
    await signInWithPopup(auth, googleProvider)
  }

  async function handleSignup({ name, email, password }) {
    setAuthError('')
    setVerificationMessage('')
    setVerificationBusy(true)
    try {
      const { user: newUser } = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(newUser, { displayName: name.trim() }).catch(() => {})
      await sendVerification(newUser)
    } finally {
      setVerificationBusy(false)
    }
  }

  async function sendVerification(current) {
    try {
      const { method } = await fetch(API_BASE + "/signup-verification").then(readJson).catch(() => ({ method: "link" }));
      setVerificationMethod(method);
      if (method === "otp") {
        const result = await requestVerification("send", {});
        setVerificationCode("");
        setVerificationMessage(result.message || "Your email is already verified. Continue to sign in.");
        return;
      }
      await sendEmailVerification(current)
      setVerificationMessage('Verification email sent. Check your inbox and spam folder.')
    } catch (error) {
      setVerificationMessage(error.code === 'auth/too-many-requests'
        ? 'Too many requests. Wait a few minutes before resending.'
        : error.message || 'The verification email could not be sent. Please try resending it.')
    }
  }

  async function handleVerification(check) {
    if (!user || verificationBusy) return
    setVerificationBusy(true)
    try {
      if (!check) {
        await sendVerification(user)
        return
      }
      if (verificationMethod === "otp") await requestVerification("confirm", { code: verificationCode });
      await user.reload()
      if (!user.emailVerified) {
        setVerificationMessage('Your email has not been verified yet. Check the verification email and try again.')
        return
      }
      await user.getIdToken(true)
      if (auth.currentUser?.uid === user.uid) {
        setLoading(true)
        setVerified(true)
      }
    } catch (error) {
      setVerificationMessage(error.message || 'Could not check your verification. Please try again.')
    } finally {
      setVerificationBusy(false)
    }
  }

  async function handleSaveProfile(value, photoURL) {
    const name = value.trim();
    if (!name || name.length > 100 || !user) throw new Error("Enter a display name.");
    await setDoc(doc(db, "users", user.uid), { name, photoURL }, { merge: true });
    setProfile((previous) => ({ ...previous, name, photoURL }));
    await updateProfile(user, { displayName: name });
  }

  async function handleLogout() {
    setVerificationMessage("")
    setVerificationCode("")
    setVerificationMethod("")
    await signOut(auth)
  }

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
        <div className="text-center">
          <div className="spinner-border text-warning mb-3" role="status" />
          <div className="fw-semibold">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginModal onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} onSignup={handleSignup} authError={authError} />
  }

  if (!verified) {
    return (
      <main className="verification-gate">
        <section className="hotel-glass" aria-labelledby="verify-title">
          <h1 id="verify-title">Verify your email</h1>
          {verificationMethod === "otp"
            ? <p>Enter the six-digit code sent to <strong>{user.email}</strong>.</p>
            : <p>Check <strong>{user.email}</strong> for your verification email.</p>}
          {verificationMessage && <p role="status" className="account-notice">{verificationMessage}</p>}
          <form className="password-recovery" onSubmit={(event) => { event.preventDefault(); handleVerification(true); }}>
            {verificationMethod === "otp" && <label>Verification code
              <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} />
            </label>}
            <div className="account-actions">
              <button type="submit" className="hotel-action" disabled={verificationBusy || !verificationMethod}>
                {verificationMethod === "otp" ? "Verify code" : "I verified my email"}
              </button>
              <button type="button" className="hotel-action secondary" disabled={verificationBusy} onClick={() => handleVerification(false)}>
                {verificationMethod === "otp" ? "Send another code" : "Resend verification email"}
              </button>
              <button type="button" className="hotel-action secondary" disabled={verificationBusy} onClick={handleLogout}>Sign out</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  if (!profile) return <p role="alert">Unable to load your account. <button type="button" onClick={handleLogout}>Sign out</button></p>

  if (user && profile && profile.role === 'admin') {
    return <Display currentUser={profile} onLogout={handleLogout} />
  }

  return (
    <HotelInfo
      user={user && profile ? profile : null}
      onLogin={handleLogin}
      onGoogleLogin={handleGoogleLogin}
      onSignup={handleSignup}
      authError={authError}
      onSaveProfile={handleSaveProfile}
      onLogout={handleLogout}
    />
  )
}
