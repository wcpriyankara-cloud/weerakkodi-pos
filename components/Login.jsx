'use client';

// components/Login.jsx
// ✅ Next.js App Router compatible

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUserAuth } from '@/context/UserContext';

/* =========================================================
   OTP INPUT COMPONENT
   ========================================================= */
function OTPInput({ value, onChange, length = 6, disabled = false }) {
  const refs = useRef([]);

  useEffect(() => {
    if (value === '' || value.length === 0) {
      refs.current[0]?.focus();
    }
  }, [value]);

  const handleChange = (index, val) => {
    if (!/^\d*$/.test(val)) return;
    const arr = (value || '').split('');
    while (arr.length < length) arr.push('');
    arr[index] = val.slice(-1);
    const newVal = arr.join('').slice(0, length);
    onChange(newVal);
    if (val && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!(value || '')[index] && index > 0) {
        refs.current[index - 1]?.focus();
        const arr = (value || '').split('');
        arr[index - 1] = '';
        onChange(arr.join(''));
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, length - 1);
      setTimeout(() => refs.current[focusIdx]?.focus(), 50);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={(value || '')[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          autoComplete="one-time-code"
          style={{
            width: 46, height: 54, textAlign: 'center',
            fontSize: 22, fontWeight: 900, borderRadius: 12, outline: 'none',
            border: (value || '')[i] ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: (value || '')[i] ? '#eff6ff' : 'white',
            color: '#1e293b', transition: 'all 0.15s',
            opacity: disabled ? 0.6 : 1,
            boxSizing: 'border-box'
          }}
        />
      ))}
    </div>
  );
}

/* =========================================================
   PASSWORD STRENGTH
   ========================================================= */
function PasswordStrength({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

  const filledBars = Math.floor((score / 6) * 4);
  const levels = [
    { min: 0, label: '', color: '#e2e8f0' },
    { min: 1, label: 'දුර්වල 😞', color: '#ef4444' },
    { min: 3, label: 'සාමාන්‍ය 😐', color: '#f59e0b' },
    { min: 4, label: 'හොඳ 😊', color: '#3b82f6' },
    { min: 5, label: 'ශක්තිමත් 💪', color: '#22c55e' },
  ];
  const level = [...levels].reverse().find((l) => score >= l.min) || levels[0];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < filledBars ? level.color : '#e2e8f0',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      {level.label && (
        <div style={{ fontSize: 11, marginTop: 3, color: level.color, fontWeight: 700 }}>
          {level.label}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SHARED STYLES
   ========================================================= */
const pageStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 20,
  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  boxSizing: 'border-box'
};

const cardStyle = {
  background: 'white', borderRadius: 20, padding: '36px 32px',
  width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  boxSizing: 'border-box'
};

const inputStyle = {
  width: '100%', padding: '13px 16px', borderRadius: 12,
  border: '2px solid #e2e8f0', fontSize: 15, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.2s',
};

const labelStyle = {
  display: 'block', marginBottom: 6, fontSize: 13,
  fontWeight: 700, color: '#334155',
};

/* =========================================================
   PRIMARY BUTTON
   ========================================================= */
function PrimaryBtn({
  onClick,
  disabled,
  loading: isLoading,
  children,
  bg = 'linear-gradient(135deg,#3b82f6,#2563eb)',
  type = 'button',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      style={{
        width: '100%', padding: '14px', borderRadius: 12, border: 'none',
        fontSize: 16, fontWeight: 800, color: 'white',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        background: disabled || isLoading ? '#94a3b8' : bg,
        boxShadow: disabled || isLoading ? 'none' : '0 4px 12px rgba(59,130,246,0.3)',
        transition: 'all 0.2s',
        boxSizing: 'border-box'
      }}
    >
      {children}
    </button>
  );
}

/* =========================================================
   ALERT BOX
   ========================================================= */
function AlertBox({ msg, type = 'error' }) {
  if (!msg) return null;
  const cfg = {
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
    success: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a' },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
  }[type] || { bg: '#f1f5f9', border: '#e2e8f0', color: '#64748b' };

  return (
    <div style={{
      padding: '11px 16px', borderRadius: 12, marginBottom: 14,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.color, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
      whiteSpace: 'pre-wrap', boxSizing: 'border-box'
    }}>
      {msg}
    </div>
  );
}

/* =========================================================
   GOOGLE ICON
   ========================================================= */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/* =========================================================
   GOOGLE SIGN-IN BUTTON
   ========================================================= */
function GoogleSignInBtn({ onClick, loading, label = 'Continue with Google' }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      type="button"
      style={{
        width: '100%', padding: '13px', borderRadius: 12,
        border: '2px solid #e2e8f0', background: 'white',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, fontSize: 15, fontWeight: 700, color: '#334155',
        transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
        boxSizing: 'border-box'
      }}
    >
      <GoogleIcon />
      {loading ? '⏳ Connecting...' : label}
    </button>
  );
}

/* =========================================================
   OR DIVIDER
   ========================================================= */
function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>හෝ</span>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  );
}

/* =========================================================
   REGISTER SCREEN
   ========================================================= */
function RegisterScreen({ onBack }) {
  const auth = useUserAuth();
  const {
    sendOTP,
    verifyOTP,
    registerWithEmail,
    isPhoneRegistered,
    isEmailRegistered,
    loginWithGoogle,
  } = auth || {};

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(0);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const timerRef = useRef(null);
  const otpAutoRef = useRef(false);

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  const handleSendOTP = async () => {
    setError(''); setSuccess('');
    const cleaned = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (cleaned.replace(/[^\d]/g, '').length < 9)
      return setError('❌ වලංගු දුරකථන අංකයක් ඇතුළත් කරන්න');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))
      return setError('❌ වලංගු email ලිපිනයක් ඇතුළත් කරන්න');

    setLoading(true);
    try {
      if (typeof isPhoneRegistered === 'function') {
        const phoneExists = await isPhoneRegistered(cleaned);
        if (phoneExists) { setError('❌ මෙම දුරකථන අංකය දැනටමත් ලියාපදිංචි වී ඇත'); setLoading(false); return; }
      }
      if (typeof isEmailRegistered === 'function') {
        const emailExists = await isEmailRegistered(email.trim());
        if (emailExists) { setError('❌ මෙම email දැනටමත් භාවිතයේ ඇත'); setLoading(false); return; }
      }
    } catch (e) { console.warn('Check error:', e); }

    if (typeof sendOTP !== 'function') {
      setError('❌ OTP සේවාව දැනට සක්‍රීය නැත.');
      setLoading(false);
      return;
    }

    const result = await sendOTP(cleaned, email.trim());
    if (result?.success) {
      setStep(2); setTimer(60);
      setSuccess(`✅ OTP යවා ඇත 📧 ${email.trim()} වෙත\nDEBUG OTP: ${result.otp || ''}`);
      otpAutoRef.current = false;
    } else {
      setError(result?.error || 'OTP යැවීම අසාර්ථක විය');
    }
    setLoading(false);
  };

  const handleVerifyOTP = useCallback(async () => {
    if ((otp || '').length !== 6) return setError('❌ OTP ඉලක්කම් 6ම ඇතුළත් කරන්න');
    setError(''); setLoading(true);
    if (typeof verifyOTP !== 'function') {
      setError('❌ Verify සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const result = await verifyOTP(phone, otp);
    if (result?.success) {
      setVerifiedPhone(phone); setStep(3); setOtp('');
      setSuccess('✅ සාර්ථකව සත්‍යාපනය විය!');
    } else {
      setError(result?.error || 'OTP verification අසාර්ථක විය');
      otpAutoRef.current = false; // Reset so user can try again!
    }
    setLoading(false);
  }, [otp, phone, verifyOTP]);

  useEffect(() => {
    if (step === 2 && otp.length === 6 && !loading && !otpAutoRef.current) {
      otpAutoRef.current = true;
      handleVerifyOTP();
    }
  }, [otp, step, loading, handleVerifyOTP]);

  const handleRegister = async () => {
    setError('');
    if (!name.trim()) return setError('❌ නම ඇතුළත් කරන්න');
    if (!password) return setError('❌ මුරපදය ඇතුළත් කරන්න');
    if (password.length < 6) return setError('❌ මුරපදය අවම අක්ෂර 6ක් විය යුතුය');
    if (password !== confirmPw) return setError('❌ මුරපද නොගැළපේ');

    setLoading(true);
    if (typeof registerWithEmail !== 'function') {
      setError('❌ ලියාපදිංචි වීමේ පහසුකම නොමැත');
      setLoading(false);
      return;
    }
    const result = await registerWithEmail({
      email: email.trim(),
      password,
      displayName: name.trim(),
      phone: verifiedPhone || phone,
      businessName: business.trim(),
      phoneVerified: true,
    });
    if (result?.success) { setStep(4); setSuccess('🎉 ගිණුම සාර්ථකව සෑදිණි!'); }
    else { setError(result?.error || 'ගිණුම සෑදීම අසාර්ථක විය'); }
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    setError(''); setLoading(true);
    if (typeof loginWithGoogle !== 'function') {
      setError('❌ Google Sign-In සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const result = await loginWithGoogle();
    if (!result?.success && result?.error) setError(result.error);
    setLoading(false);
  };

  const handleResend = async () => {
    if (timer > 0) return;
    setOtp(''); setError(''); otpAutoRef.current = false;
    await handleSendOTP();
  };

  const StepDots = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 24 }}>
      {[
        { n: 1, icon: '📱', label: 'Info' },
        { n: 2, icon: '🔢', label: 'OTP' },
        { n: 3, icon: '📝', label: 'Account' },
        { n: 4, icon: '✅', label: 'Done' },
      ].map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, margin: '0 auto 2px',
              background: step > s.n ? '#22c55e' : step === s.n ? '#3b82f6' : '#e2e8f0',
              color: step >= s.n ? 'white' : '#94a3b8', transition: 'all 0.3s',
            }}>
              {step > s.n ? '✓' : s.icon}
            </div>
            <div style={{ fontSize: 9, color: step >= s.n ? '#3b82f6' : '#94a3b8', fontWeight: 600 }}>{s.label}</div>
          </div>
          {i < 3 && (
            <div style={{
              flex: 1, height: 3, borderRadius: 2, maxWidth: 36, marginBottom: 16,
              background: step > s.n ? '#22c55e' : '#e2e8f0',
              transition: 'background 0.3s',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🏪</div>
          <h1 style={{ margin: '0 0 3px', fontSize: 21, color: '#1e293b' }}>නව ගිණුමක් සාදන්න</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Email OTP සත්‍යාපනය</p>
        </div>

        <StepDots />
        <AlertBox msg={error} type="error" />
        <AlertBox msg={success} type="success" />

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '12px 16px', marginBottom: 18, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>📧 Email OTP සත්‍යාපනය</div>
              <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>ඔබේ email එකට OTP කේතයක් යවනු ලැබේ</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>📱 දුරකථන අංකය (Sri Lanka)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, pointerEvents: 'none' }}>🇱🇰</span>
                <input type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
                  placeholder="077 123 4567"
                  style={{ ...inputStyle, paddingLeft: 44, fontSize: 17, fontWeight: 700, letterSpacing: 1 }}
                  disabled={loading} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>📧 Email ලිපිනය</label>
              <input type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" style={inputStyle}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>📧 OTP කේතය මෙම email එකට යවනු ලැබේ</div>
            </div>

            <PrimaryBtn onClick={handleSendOTP} disabled={!phone.trim() || !email.trim() || loading} loading={loading}>
              {loading ? '⏳ OTP යවමින්...' : '📧 OTP යවන්න'}
            </PrimaryBtn>

            <OrDivider />
            <GoogleSignInBtn onClick={handleGoogleRegister} loading={loading} label="Continue with Google" />

            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#64748b' }}>
              දැනටමත් ගිණුමක් ඇත?{' '}
              <span onClick={onBack} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                ඇතුළු වන්න →
              </span>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={{ background: '#fefce8', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #fde047', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>📧</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#854d0e' }}>OTP කේතය ඇතුළත් කරන්න</div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 3 }}>{email} — වෙත OTP කේතය යවා ඇත</div>
              <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>📱 Phone: {phone}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <OTPInput value={otp} onChange={(v) => { setOtp(v); otpAutoRef.current = false; }} disabled={loading} />
            </div>

            <PrimaryBtn onClick={handleVerifyOTP} disabled={loading || (otp || '').length !== 6} loading={loading} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? '⏳ සත්‍යාපනය වෙමින්...' : '✅ OTP Verify කරන්න'}
            </PrimaryBtn>

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              {timer > 0 ? (
                <span style={{ color: '#94a3b8' }}>⏱️ නැවත OTP: <b style={{ color: '#3b82f6' }}>{timer}s</b></span>
              ) : (
                <span onClick={handleResend} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  🔄 OTP නැවත යවන්න
                </span>
              )}
            </div>

            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginTop: 14, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1e40af' }}>💡 Email එකේ Inbox / Spam / Promotions folders පරීක්ෂා කරන්න</div>
            </div>

            <button onClick={() => { setStep(1); setOtp(''); setError(''); setSuccess(''); otpAutoRef.current = false; }}
              style={{ width: '100%', padding: '11px', marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              ← ආපසු යන්න
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div style={{ background: '#dcfce7', borderRadius: 12, padding: '10px 14px', marginBottom: 16, border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>OTP සත්‍යාපනය සාර්ථකයි!</div>
                <div style={{ fontSize: 11, color: '#16a34a' }}>📱 {verifiedPhone || phone} &nbsp;|&nbsp; 📧 {email}</div>
              </div>
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>👤 සම්පූර්ණ නම *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="ඔබේ නම" style={inputStyle} disabled={loading} />
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>🏪 ව්‍යාපාර නම</label>
              <input type="text" value={business} onChange={(e) => setBusiness(e.target.value)}
                placeholder="ව්‍යාපාර නම (optional)" style={inputStyle} disabled={loading} />
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 13, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 12, color: '#166534' }}>📧 Email: <b>{email}</b> (OTP verified ✅)</div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>📱 Phone: <b>{verifiedPhone || phone}</b></div>
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>🔒 මුරපදය *</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="අවම අක්ෂර 6ක්"
                  style={{ ...inputStyle, paddingRight: 44 }} disabled={loading} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>🔒 මුරපදය තහවුරු කරන්න *</label>
              <input type={showPw ? 'text' : 'password'} value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="නැවත මුරපදය"
                style={{ ...inputStyle, borderColor: confirmPw && password !== confirmPw ? '#ef4444' : '#e2e8f0' }}
                disabled={loading} />
              {confirmPw && password !== confirmPw && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>❌ මුරපද නොගැළපේ</div>
              )}
              {confirmPw && password === confirmPw && confirmPw.length > 0 && (
                <div style={{ fontSize: 11, color: '#22c55e', marginTop: 3 }}>✅ මුරපද ගැළපේ</div>
              )}
            </div>

            <PrimaryBtn onClick={handleRegister} loading={loading}>
              {loading ? '⏳ ගිණුම සාදමින්...' : '🚀 ගිණුම සාදන්න'}
            </PrimaryBtn>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#166534' }}>ගිණුම සාර්ථකයි!</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>
              ✅ OTP verified &nbsp;|&nbsp; 📧 Email verification pending
            </p>

            <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, border: '1px solid #fde047', marginBottom: 18, textAlign: 'left' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#854d0e', marginBottom: 6 }}>📧 Email සත්‍යාපනය</div>
              <div style={{ fontSize: 13, color: '#a16207' }}>
                <b>{email}</b> වෙත verification link යවා ඇත.<br />
                Inbox (spam folder ද) පරීක්ෂා කර link click කරන්න.
              </div>
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', border: '1px solid #86efac', marginBottom: 18, textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: '#166534' }}>📱 Phone: <b>{verifiedPhone || phone}</b></div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>📧 Email: <b>{email}</b></div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>👤 Name: <b>{name}</b></div>
            </div>

            <PrimaryBtn onClick={onBack} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              🚀 Login Page එකට යන්න
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   FORGOT PASSWORD SCREEN
   ========================================================= */
function ForgotPasswordScreen({ onBack }) {
  const auth = useUserAuth();
  const { sendOTP, verifyOTP, resetPasswordByEmail } = auth || {};

  const [step, setStep] = useState(1);
  const [method, setMethod] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);
  const otpAutoRef = useRef(false);

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  const reset = () => { setError(''); setSuccess(''); };

  const handleEmailReset = async () => {
    reset();
    if (!email.trim()) return setError('❌ Email ඇතුළත් කරන්න');
    setLoading(true);
    if (typeof resetPasswordByEmail !== 'function') {
      setError('❌ Reset සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const r = await resetPasswordByEmail(email.trim());
    if (r?.success) { setStep(5); setSuccess(r.message || 'Reset link යවා ඇත'); }
    else { setError(r?.error || 'Reset යැවීම අසාර්ථක විය'); }
    setLoading(false);
  };

  const handlePhoneSend = async () => {
    reset();
    if (!phone.trim()) return setError('❌ දුරකථන අංකය ඇතුළත් කරන්න');
    if (!resetEmail.trim() || !/\S+@\S+\.\S+/.test(resetEmail))
      return setError('❌ වලංගු email ලිපිනයක් ඇතුළත් කරන්න');

    setLoading(true);
    if (typeof sendOTP !== 'function') {
      setError('❌ OTP සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const result = await sendOTP(phone.trim(), resetEmail.trim());
    if (result?.success) {
      setStep(3); setTimer(60);
      setSuccess(`✅ OTP යවා ඇත 📧 ${resetEmail.trim()} වෙත\nDEBUG OTP: ${result.otp || ''}`);
      otpAutoRef.current = false;
    } else { setError(result?.error || 'OTP යැවීම අසාර්ථක විය'); }
    setLoading(false);
  };

  const handleOTPVerify = useCallback(async () => {
    if ((otp || '').length !== 6) return setError('❌ OTP ඉලක්කම් 6ම ඇතුළත් කරන්න');
    reset(); setLoading(true);
    if (typeof verifyOTP !== 'function') {
      setError('❌ Verify සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const r = await verifyOTP(phone, otp);
    if (r?.success) {
      const resetResult = await resetPasswordByEmail(resetEmail.trim());
      if (resetResult?.success) {
        setStep(5);
        setSuccess('✅ OTP Verified! Password reset link ' + resetEmail + ' වෙත යවා ඇත');
      } else { setError(resetResult?.error || 'Reset අසාර්ථක විය'); }
    } else {
      setError(r?.error || 'OTP verification අසාර්ථක විය');
      setOtp('');
      otpAutoRef.current = false;
    }
    setLoading(false);
  }, [otp, phone, resetEmail, verifyOTP, resetPasswordByEmail]);

  useEffect(() => {
    if (step === 3 && otp.length === 6 && !loading && !otpAutoRef.current) {
      otpAutoRef.current = true;
      handleOTPVerify();
    }
  }, [otp, step, loading, handleOTPVerify]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🔑</div>
          <h1 style={{ margin: '0 0 3px', fontSize: 21, color: '#1e293b' }}>මුරපදය නැවත ලබා ගන්න</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Email හෝ Phone + Email OTP මගින්</p>
        </div>

        <AlertBox msg={error} type="error" />
        <AlertBox msg={success} type="success" />

        {/* Step 1 — choose method */}
        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
              {[
                { m: 'email', icon: '📧', title: 'Email Reset', desc: 'Password reset link email එකට', bg: '#eff6ff' },
                { m: 'phone', icon: '📱', title: 'Phone + Email OTP', desc: 'Email OTP verify කර password reset', bg: '#f0fdf4' },
              ].map((o) => (
                <div key={o.m} onClick={() => { setMethod(o.m); setStep(2); reset(); }}
                  style={{ padding: 18, borderRadius: 14, border: `2px solid ${o.bg}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: o.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{o.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{o.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{o.desc}</div>
                  </div>
                  <span style={{ fontSize: 20 }}>→</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13 }}>
              <span onClick={onBack} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>← Login Page</span>
            </div>
          </div>
        )}

        {/* Step 2 — Email method */}
        {step === 2 && method === 'email' && (
          <div>
            <label style={labelStyle}>📧 ලියාපදිංචි Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={{ ...inputStyle, marginBottom: 18 }}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailReset()} disabled={loading} />
            <PrimaryBtn onClick={handleEmailReset} loading={loading} disabled={!email.trim()}>
              {loading ? '⏳ යවමින්...' : '📧 Reset Link යවන්න'}
            </PrimaryBtn>
            <button onClick={() => { setStep(1); reset(); }}
              style={{ width: '100%', padding: 11, marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              ← ආපසු
            </button>
          </div>
        )}

        {/* Step 2 — Phone method */}
        {step === 2 && method === 'phone' && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>📱 ලියාපදිංචි දුරකථන අංකය</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, pointerEvents: 'none' }}>🇱🇰</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
                  placeholder="077 123 4567"
                  style={{ ...inputStyle, paddingLeft: 44, fontSize: 17, fontWeight: 700 }}
                  disabled={loading} />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>📧 Email ලිපිනය (OTP ලැබීමට)</label>
              <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                placeholder="your@email.com" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handlePhoneSend()} disabled={loading} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>📧 OTP කේතය මෙම email එකට යවනු ලැබේ</div>
            </div>
            <PrimaryBtn onClick={handlePhoneSend} loading={loading} disabled={!phone.trim() || !resetEmail.trim()} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? '⏳ OTP යවමින්...' : '📧 OTP යවන්න'}
            </PrimaryBtn>
            <button onClick={() => { setStep(1); reset(); }}
              style={{ width: '100%', padding: 11, marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              ← ආපසු
            </button>
          </div>
        )}

        {/* Step 3 — OTP verify */}
        {step === 3 && (
          <div>
            <div style={{ background: '#fefce8', borderRadius: 12, padding: 14, marginBottom: 18, border: '1px solid #fde047', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 4 }}>📧</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#854d0e' }}>OTP ඇතුළත් කරන්න</div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>{resetEmail} වෙත OTP යවා ඇත</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <OTPInput value={otp} onChange={(v) => { setOtp(v); otpAutoRef.current = false; }} disabled={loading} />
            </div>
            <PrimaryBtn onClick={handleOTPVerify} loading={loading} disabled={(otp || '').length !== 6} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? '⏳ Verify...' : '✅ OTP Verify කරන්න'}
            </PrimaryBtn>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
              {timer > 0 ? (
                <span style={{ color: '#94a3b8' }}>⏱️ {timer}s</span>
              ) : (
                <span onClick={() => { otpAutoRef.current = false; handlePhoneSend(); }}
                  style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>
                  🔄 OTP නැවත යවන්න
                </span>
              )}
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginTop: 14, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1e40af' }}>💡 Email එකේ Inbox / Spam / Promotions folders පරීක්ෂා කරන්න</div>
            </div>
          </div>
        )}

        {/* Step 5 — Done */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 21, color: '#166534' }}>සාර්ථකයි!</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
              📧 Password reset link email එකට යවා ඇත. Inbox (spam ද) පරීක්ෂා කරන්න.
            </p>
            <PrimaryBtn onClick={onBack} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              🚀 Login Page
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   MAIN LOGIN — Default Export
   ========================================================= */
export default function Login() {
  const auth = useUserAuth();
  const { login, loginWithGoogle, user } = auth || {};

  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return null;

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('❌ Email සහ මුරපදය ඇතුළත් කරන්න');
    setLoading(true);
    if (typeof login !== 'function') {
      setError('❌ Login සේවාව සක්‍රීය නැත.');
      setLoading(false);
      return;
    }
    const result = await login(email.trim(), password);
    if (!result?.success) setError(result?.error || 'Login අසාර්ථක විය');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    if (typeof loginWithGoogle !== 'function') {
      setError('❌ Google Sign-In සේවාව නොමැත');
      setLoading(false);
      return;
    }
    const result = await loginWithGoogle();
    if (!result?.success) setError(result?.error || 'Google Sign-In අසාර්ථක විය');
    setLoading(false);
  };

  if (screen === 'register') return <RegisterScreen onBack={() => setScreen('login')} />;
  if (screen === 'forgot') return <ForgotPasswordScreen onBack={() => setScreen('login')} />;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🏪</div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, color: '#1e293b' }}>POS System</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>ඔබේ ගිණුමට ඇතුළු වන්න</p>
        </div>

        <AlertBox msg={error} type="error" />

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 15 }}>
            <label style={labelStyle}>📧 Email ලිපිනය</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={inputStyle}
              disabled={loading} required autoComplete="email" />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>🔒 මුරපදය</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ඔබේ මුරපදය"
                style={{ ...inputStyle, paddingRight: 44 }}
                disabled={loading} required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <span onClick={() => setScreen('forgot')}
              style={{ color: '#3b82f6', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              🔑 මුරපදය අමතකද?
            </span>
          </div>

          <PrimaryBtn type="submit" loading={loading}>
            {loading ? '⏳ ඇතුළු වෙමින්...' : '🚀 ඇතුළු වන්න'}
          </PrimaryBtn>
        </form>

        <OrDivider />
        <GoogleSignInBtn onClick={handleGoogleLogin} loading={loading} />

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
          <span style={{ color: '#64748b', fontSize: 14 }}>ගිණුමක් නැද්ද? </span>
          <span onClick={() => setScreen('register')}
            style={{ color: '#3b82f6', fontWeight: 800, fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
            නව ගිණුමක් සාදන්න →
          </span>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            🔒 Secure &nbsp;|&nbsp; 📧 Email OTP &nbsp;|&nbsp; 🔵 Google
          </div>
        </div>
      </div>
    </div>
  );
}