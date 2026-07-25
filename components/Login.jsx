'use client';

// components/Login.jsx
// âœ… Next.js App Router compatible

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUserAuth } from '@/context/UserContext';

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   OTP INPUT COMPONENT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
          }}
        />
      ))}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PASSWORD STRENGTH
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
    { min: 1, label: 'à¶¯à·”à¶»à·Šà·€à¶½ ðŸ˜Ÿ', color: '#ef4444' },
    { min: 3, label: 'à·ƒà·à¶¸à·à¶±à·Šâ€à¶º ðŸ˜', color: '#f59e0b' },
    { min: 4, label: 'à·„à·œà¶³ ðŸ˜Š', color: '#3b82f6' },
    { min: 5, label: 'à·à¶šà·Šà¶­à·’à¶¸à¶­à·Š ðŸ’ª', color: '#22c55e' },
  ];
  const level = [...levels].reverse().find((l) => score >= l.min);

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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SHARED STYLES
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const pageStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 20,
  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const cardStyle = {
  background: 'white', borderRadius: 20, padding: '36px 32px',
  width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PRIMARY BUTTON
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
      }}
    >
      {children}
    </button>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ALERT BOX
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
      whiteSpace: 'pre-wrap',
    }}>
      {msg}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GOOGLE ICON
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GOOGLE SIGN-IN BUTTON
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function GoogleSignInBtn({ onClick, loading, label = 'Continue with Google' }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: '100%', padding: '13px', borderRadius: 12,
        border: '2px solid #e2e8f0', background: 'white',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, fontSize: 15, fontWeight: 700, color: '#334155',
        transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
      }}
    >
      <GoogleIcon />
      {loading ? 'â³ Connecting...' : label}
    </button>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   OR DIVIDER
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>à·„à·</span>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   REGISTER SCREEN
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function RegisterScreen({ onBack }) {
  const {
    sendOTP,
    verifyOTP,
    registerWithEmail,
    isPhoneRegistered,
    isEmailRegistered,
    loginWithGoogle,
  } = useUserAuth();

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
      return setError('âŒ à·€à¶½à¶‚à¶œà·” à¶¯à·”à¶»à¶šà¶­à¶± à¶…à¶‚à¶šà¶ºà¶šà·Š à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))
      return setError('âŒ à·€à¶½à¶‚à¶œà·” email à¶½à·’à¶´à·’à¶±à¶ºà¶šà·Š à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');

    setLoading(true);
    try {
      const phoneExists = await isPhoneRegistered(cleaned);
      if (phoneExists) { setError('âŒ à¶¸à·™à¶¸ à¶¯à·”à¶»à¶šà¶­à¶± à¶…à¶‚à¶šà¶º à¶¯à·à¶±à¶§à¶¸à¶­à·Š à¶½à·’à¶ºà·à¶´à¶¯à·’à¶‚à¶ à·’ à·€à·“ à¶‡à¶­'); setLoading(false); return; }
      const emailExists = await isEmailRegistered(email.trim());
      if (emailExists) { setError('âŒ à¶¸à·™à¶¸ email à¶¯à·à¶±à¶§à¶¸à¶­à·Š à¶·à·à·€à·’à¶­à¶ºà·š à¶‡à¶­'); setLoading(false); return; }
    } catch (e) { console.warn('Check error:', e); }

    const result = await sendOTP(cleaned, email.trim());
    if (result.success) {
      setStep(2); setTimer(60);
      setSuccess(`âœ… OTP à¶ºà·€à· à¶‡à¶­ ðŸ“§ ${email.trim()} à·€à·™à¶­\nDEBUG OTP: ${result.otp || ''}`);
      otpAutoRef.current = false;
    } else {
      setError(result.error || 'OTP à¶ºà·à·€à·“à¶¸ à¶…à·ƒà·à¶»à·Šà¶®à¶š à·€à·’à¶º');
    }
    setLoading(false);
  };

  const handleVerifyOTP = useCallback(async () => {
    if ((otp || '').length !== 6) return setError('âŒ OTP à¶‰à¶½à¶šà·Šà¶šà¶¸à·Š 6à¶¸ à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    setError(''); setLoading(true);
    const result = await verifyOTP(phone, otp);
    if (result.success) {
      setVerifiedPhone(phone); setStep(3); setOtp('');
      setSuccess('âœ… à·ƒà·à¶»à·Šà¶®à¶šà·€ à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º à·€à·’à¶º!');
    } else {
      setError(result.error || 'OTP verification à¶…à·ƒà·à¶»à·Šà¶®à¶š à·€à·’à¶º'); setOtp('');
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
    if (!name.trim()) return setError('âŒ à¶±à¶¸ à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    if (!password) return setError('âŒ à¶¸à·”à¶»à¶´à¶¯à¶º à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    if (password.length < 6) return setError('âŒ à¶¸à·”à¶»à¶´à¶¯à¶º à¶…à·€à¶¸ à¶…à¶šà·Šà·‚à¶» 6à¶šà·Š à·€à·’à¶º à¶ºà·”à¶­à·”à¶º');
    if (password !== confirmPw) return setError('âŒ à¶¸à·”à¶»à¶´à¶¯ à¶±à·œà¶œà·à·…à¶´à·š');

    setLoading(true);
    const result = await registerWithEmail({
      email: email.trim(),
      password,
      displayName: name.trim(),
      phone: verifiedPhone || phone,
      businessName: business.trim(),
      phoneVerified: true,
    });
    if (result.success) { setStep(4); setSuccess('ðŸŽ‰ à¶œà·’à¶«à·”à¶¸ à·ƒà·à¶»à·Šà¶®à¶šà·€ à·ƒà·‘à¶¯à·’à¶«à·’!'); }
    else { setError(result.error || 'à¶œà·’à¶«à·”à¶¸ à·ƒà·‘à¶¯à·“à¶¸ à¶…à·ƒà·à¶»à·Šà¶®à¶š à·€à·’à¶º'); }
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    setError(''); setLoading(true);
    const result = await loginWithGoogle();
    if (!result.success && result.error) setError(result.error);
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
        { n: 1, icon: 'ðŸ“±', label: 'Info' },
        { n: 2, icon: 'ðŸ”¢', label: 'OTP' },
        { n: 3, icon: 'ðŸ“', label: 'Account' },
        { n: 4, icon: 'âœ…', label: 'Done' },
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
              {step > s.n ? 'âœ“' : s.icon}
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
          <div style={{ fontSize: 44, marginBottom: 6 }}>ðŸª</div>
          <h1 style={{ margin: '0 0 3px', fontSize: 21, color: '#1e293b' }}>à¶±à·€ à¶œà·’à¶«à·”à¶¸à¶šà·Š à·ƒà·à¶¯à¶±à·Šà¶±</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Email OTP à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º</p>
        </div>

        <StepDots />
        <AlertBox msg={error} type="error" />
        <AlertBox msg={success} type="success" />

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <div style={{ background: '#eff6ff', borderRadius: 12, padding: '12px 16px', marginBottom: 18, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>ðŸ“§ Email OTP à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º</div>
              <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>à¶”à¶¶à·š email à¶‘à¶šà¶§ OTP à¶šà·šà¶­à¶ºà¶šà·Š à¶ºà·€à¶±à·” à¶½à·à¶¶à·š</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>ðŸ“± à¶¯à·”à¶»à¶šà¶­à¶± à¶…à¶‚à¶šà¶º (Sri Lanka)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, pointerEvents: 'none' }}>ðŸ‡±ðŸ‡°</span>
                <input type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
                  placeholder="077 123 4567"
                  style={{ ...inputStyle, paddingLeft: 44, fontSize: 17, fontWeight: 700, letterSpacing: 1 }}
                  disabled={loading} autoFocus />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>ðŸ“§ Email à¶½à·’à¶´à·’à¶±à¶º</label>
              <input type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" style={inputStyle}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>ðŸ“§ OTP à¶šà·šà¶­à¶º à¶¸à·™à¶¸ email à¶‘à¶šà¶§ à¶ºà·€à¶±à·” à¶½à·à¶¶à·š</div>
            </div>

            <PrimaryBtn onClick={handleSendOTP} disabled={!phone.trim() || !email.trim() || loading} loading={loading}>
              {loading ? 'â³ OTP à¶ºà·€à¶¸à·’à¶±à·Š...' : 'ðŸ“§ OTP à¶ºà·€à¶±à·Šà¶±'}
            </PrimaryBtn>

            <OrDivider />
            <GoogleSignInBtn onClick={handleGoogleRegister} loading={loading} label="Continue with Google" />

            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#64748b' }}>
              à¶¯à·à¶±à¶§à¶¸à¶­à·Š à¶œà·’à¶«à·”à¶¸à¶šà·Š à¶‡à¶­?{' '}
              <span onClick={onBack} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                à¶‡à¶­à·”à¶½à·Š à·€à¶±à·Šà¶± â†’
              </span>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={{ background: '#fefce8', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #fde047', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>ðŸ“§</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#854d0e' }}>OTP à¶šà·šà¶­à¶º à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±</div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 3 }}>{email} â€” à·€à·™à¶­ OTP à¶šà·šà¶­à¶º à¶ºà·€à· à¶‡à¶­</div>
              <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>ðŸ“± Phone: {phone}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <OTPInput value={otp} onChange={(v) => { setOtp(v); otpAutoRef.current = false; }} disabled={loading} />
            </div>

            <PrimaryBtn onClick={handleVerifyOTP} disabled={loading || (otp || '').length !== 6} loading={loading} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? 'â³ à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º à·€à·™à¶¸à·’à¶±à·Š...' : 'âœ… OTP Verify à¶šà¶»à¶±à·Šà¶±'}
            </PrimaryBtn>

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              {timer > 0 ? (
                <span style={{ color: '#94a3b8' }}>â±ï¸ à¶±à·à·€à¶­ OTP: <b style={{ color: '#3b82f6' }}>{timer}s</b></span>
              ) : (
                <span onClick={handleResend} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  ðŸ”„ OTP à¶±à·à·€à¶­ à¶ºà·€à¶±à·Šà¶±
                </span>
              )}
            </div>

            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginTop: 14, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1e40af' }}>ðŸ’¡ Email à¶‘à¶šà·š Inbox / Spam / Promotions folders à¶´à¶»à·“à¶šà·Šà·‚à· à¶šà¶»à¶±à·Šà¶±</div>
            </div>

            <button onClick={() => { setStep(1); setOtp(''); setError(''); setSuccess(''); otpAutoRef.current = false; }}
              style={{ width: '100%', padding: '11px', marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              â† à¶†à¶´à·ƒà·” à¶ºà¶±à·Šà¶±
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div style={{ background: '#dcfce7', borderRadius: 12, padding: '10px 14px', marginBottom: 16, border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>âœ…</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>OTP à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º à·ƒà·à¶»à·Šà¶®à¶šà¶ºà·’!</div>
                <div style={{ fontSize: 11, color: '#16a34a' }}>ðŸ“± {verifiedPhone || phone} &nbsp;|&nbsp; ðŸ“§ {email}</div>
              </div>
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>ðŸ‘¤ à·ƒà¶¸à·Šà¶´à·–à¶»à·Šà¶« à¶±à¶¸ *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="à¶”à¶¶à·š à¶±à¶¸" style={inputStyle} disabled={loading} autoFocus />
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>ðŸª à·€à·Šâ€à¶ºà·à¶´à·à¶» à¶±à¶¸</label>
              <input type="text" value={business} onChange={(e) => setBusiness(e.target.value)}
                placeholder="à·€à·Šâ€à¶ºà·à¶´à·à¶» à¶±à¶¸ (optional)" style={inputStyle} disabled={loading} />
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 13, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 12, color: '#166534' }}>ðŸ“§ Email: <b>{email}</b> (OTP verified âœ…)</div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>ðŸ“± Phone: <b>{verifiedPhone || phone}</b></div>
            </div>

            <div style={{ marginBottom: 13 }}>
              <label style={labelStyle}>ðŸ”’ à¶¸à·”à¶»à¶´à¶¯à¶º *</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="à¶…à·€à¶¸ à¶…à¶šà·Šà·‚à¶» 6à¶šà·Š"
                  style={{ ...inputStyle, paddingRight: 44 }} disabled={loading} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                  {showPw ? 'ðŸ™ˆ' : 'ðŸ‘ï¸'}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>ðŸ”’ à¶¸à·”à¶»à¶´à¶¯à¶º à¶­à·„à·€à·”à¶»à·” à¶šà¶»à¶±à·Šà¶± *</label>
              <input type={showPw ? 'text' : 'password'} value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="à¶±à·à·€à¶­ à¶¸à·”à¶»à¶´à¶¯à¶º"
                style={{ ...inputStyle, borderColor: confirmPw && password !== confirmPw ? '#ef4444' : '#e2e8f0' }}
                disabled={loading} />
              {confirmPw && password !== confirmPw && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>âŒ à¶¸à·”à¶»à¶´à¶¯ à¶±à·œà¶œà·à·…à¶´à·š</div>
              )}
              {confirmPw && password === confirmPw && confirmPw.length > 0 && (
                <div style={{ fontSize: 11, color: '#22c55e', marginTop: 3 }}>âœ… à¶¸à·”à¶»à¶´à¶¯ à¶œà·à·…à¶´à·š</div>
              )}
            </div>

            <PrimaryBtn onClick={handleRegister} loading={loading}>
              {loading ? 'â³ à¶œà·’à¶«à·”à¶¸ à·ƒà·à¶¯à¶¸à·’à¶±à·Š...' : 'ðŸš€ à¶œà·’à¶«à·”à¶¸ à·ƒà·à¶¯à¶±à·Šà¶±'}
            </PrimaryBtn>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>ðŸŽ‰</div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#166534' }}>à¶œà·’à¶«à·”à¶¸ à·ƒà·à¶»à·Šà¶®à¶šà¶ºà·’!</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 18 }}>
              âœ… OTP verified &nbsp;|&nbsp; ðŸ“§ Email verification pending
            </p>

            <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, border: '1px solid #fde047', marginBottom: 18, textAlign: 'left' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#854d0e', marginBottom: 6 }}>ðŸ“§ Email à·ƒà¶­à·Šâ€à¶ºà·à¶´à¶±à¶º</div>
              <div style={{ fontSize: 13, color: '#a16207' }}>
                <b>{email}</b> à·€à·™à¶­ verification link à¶ºà·€à· à¶‡à¶­.<br />
                Inbox (spam folder à¶¯) à¶´à¶»à·“à¶šà·Šà·‚à· à¶šà¶» link click à¶šà¶»à¶±à·Šà¶±.
              </div>
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', border: '1px solid #86efac', marginBottom: 18, textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: '#166534' }}>ðŸ“± Phone: <b>{verifiedPhone || phone}</b></div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>ðŸ“§ Email: <b>{email}</b></div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 3 }}>ðŸ‘¤ Name: <b>{name}</b></div>
            </div>

            <PrimaryBtn onClick={onBack} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              ðŸš€ Login Page à¶‘à¶šà¶§ à¶ºà¶±à·Šà¶±
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FORGOT PASSWORD SCREEN
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ForgotPasswordScreen({ onBack }) {
  const { sendOTP, verifyOTP, resetPasswordByEmail } = useUserAuth();

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
    if (!email.trim()) return setError('âŒ Email à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    setLoading(true);
    const r = await resetPasswordByEmail(email.trim());
    if (r.success) { setStep(5); setSuccess(r.message); }
    else { setError(r.error); }
    setLoading(false);
  };

  const handlePhoneSend = async () => {
    reset();
    if (!phone.trim()) return setError('âŒ à¶¯à·”à¶»à¶šà¶­à¶± à¶…à¶‚à¶šà¶º à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    if (!resetEmail.trim() || !/\S+@\S+\.\S+/.test(resetEmail))
      return setError('âŒ à·€à¶½à¶‚à¶œà·” email à¶½à·’à¶´à·’à¶±à¶ºà¶šà·Š à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');

    setLoading(true);
    const result = await sendOTP(phone.trim(), resetEmail.trim());
    if (result.success) {
      setStep(3); setTimer(60);
      setSuccess(`âœ… OTP à¶ºà·€à· à¶‡à¶­ ðŸ“§ ${resetEmail.trim()} à·€à·™à¶­\nDEBUG OTP: ${result.otp || ''}`);
      otpAutoRef.current = false;
    } else { setError(result.error); }
    setLoading(false);
  };

  const handleOTPVerify = useCallback(async () => {
    if ((otp || '').length !== 6) return setError('âŒ OTP à¶‰à¶½à¶šà·Šà¶šà¶¸à·Š 6à¶¸ à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    reset(); setLoading(true);
    const r = await verifyOTP(phone, otp);
    if (r.success) {
      const resetResult = await resetPasswordByEmail(resetEmail.trim());
      if (resetResult.success) {
        setStep(5);
        setSuccess('âœ… OTP Verified! Password reset link ' + resetEmail + ' à·€à·™à¶­ à¶ºà·€à· à¶‡à¶­');
      } else { setError(resetResult.error); }
    } else { setError(r.error); setOtp(''); }
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
          <div style={{ fontSize: 44, marginBottom: 6 }}>ðŸ”</div>
          <h1 style={{ margin: '0 0 3px', fontSize: 21, color: '#1e293b' }}>à¶¸à·”à¶»à¶´à¶¯à¶º à¶±à·à·€à¶­ à¶½à¶¶à· à¶œà¶±à·Šà¶±</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Email à·„à· Phone + Email OTP à¶¸à¶œà·’à¶±à·Š</p>
        </div>

        <AlertBox msg={error} type="error" />
        <AlertBox msg={success} type="success" />

        {/* Step 1 â€” choose method */}
        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
              {[
                { m: 'email', icon: 'ðŸ“§', title: 'Email Reset', desc: 'Password reset link email à¶‘à¶šà¶§', bg: '#eff6ff' },
                { m: 'phone', icon: 'ðŸ“±', title: 'Phone + Email OTP', desc: 'Email OTP verify à¶šà¶» password reset', bg: '#f0fdf4' },
              ].map((o) => (
                <div key={o.m} onClick={() => { setMethod(o.m); setStep(2); reset(); }}
                  style={{ padding: 18, borderRadius: 14, border: `2px solid ${o.bg}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: o.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{o.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{o.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{o.desc}</div>
                  </div>
                  <span style={{ fontSize: 20 }}>â†’</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13 }}>
              <span onClick={onBack} style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>â† Login Page</span>
            </div>
          </div>
        )}

        {/* Step 2 â€” Email method */}
        {step === 2 && method === 'email' && (
          <div>
            <label style={labelStyle}>ðŸ“§ à¶½à·’à¶ºà·à¶´à¶¯à·’à¶‚à¶ à·’ Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={{ ...inputStyle, marginBottom: 18 }}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailReset()} disabled={loading} autoFocus />
            <PrimaryBtn onClick={handleEmailReset} loading={loading} disabled={!email.trim()}>
              {loading ? 'â³ à¶ºà·€à¶¸à·’à¶±à·Š...' : 'ðŸ“§ Reset Link à¶ºà·€à¶±à·Šà¶±'}
            </PrimaryBtn>
            <button onClick={() => { setStep(1); reset(); }}
              style={{ width: '100%', padding: 11, marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              â† à¶†à¶´à·ƒà·”
            </button>
          </div>
        )}

        {/* Step 2 â€” Phone method */}
        {step === 2 && method === 'phone' && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>ðŸ“± à¶½à·’à¶ºà·à¶´à¶¯à·’à¶‚à¶ à·’ à¶¯à·”à¶»à¶šà¶­à¶± à¶…à¶‚à¶šà¶º</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, pointerEvents: 'none' }}>ðŸ‡±ðŸ‡°</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
                  placeholder="077 123 4567"
                  style={{ ...inputStyle, paddingLeft: 44, fontSize: 17, fontWeight: 700 }}
                  disabled={loading} autoFocus />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>ðŸ“§ Email à¶½à·’à¶´à·’à¶±à¶º (OTP à¶½à·à¶¶à·“à¶¸à¶§)</label>
              <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                placeholder="your@email.com" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handlePhoneSend()} disabled={loading} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>ðŸ“§ OTP à¶šà·šà¶­à¶º à¶¸à·™à¶¸ email à¶‘à¶šà¶§ à¶ºà·€à¶±à·” à¶½à·à¶¶à·š</div>
            </div>
            <PrimaryBtn onClick={handlePhoneSend} loading={loading} disabled={!phone.trim() || !resetEmail.trim()} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? 'â³ OTP à¶ºà·€à¶¸à·’à¶±à·Š...' : 'ðŸ“§ OTP à¶ºà·€à¶±à·Šà¶±'}
            </PrimaryBtn>
            <button onClick={() => { setStep(1); reset(); }}
              style={{ width: '100%', padding: 11, marginTop: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              â† à¶†à¶´à·ƒà·”
            </button>
          </div>
        )}

        {/* Step 3 â€” OTP verify */}
        {step === 3 && (
          <div>
            <div style={{ background: '#fefce8', borderRadius: 12, padding: 14, marginBottom: 18, border: '1px solid #fde047', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 4 }}>ðŸ“§</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#854d0e' }}>OTP à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±</div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>{resetEmail} à·€à·™à¶­ OTP à¶ºà·€à· à¶‡à¶­</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <OTPInput value={otp} onChange={(v) => { setOtp(v); otpAutoRef.current = false; }} disabled={loading} />
            </div>
            <PrimaryBtn onClick={handleOTPVerify} loading={loading} disabled={(otp || '').length !== 6} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              {loading ? 'â³ Verify...' : 'âœ… OTP Verify à¶šà¶»à¶±à·Šà¶±'}
            </PrimaryBtn>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
              {timer > 0 ? (
                <span style={{ color: '#94a3b8' }}>â±ï¸ {timer}s</span>
              ) : (
                <span onClick={() => { otpAutoRef.current = false; handlePhoneSend(); }}
                  style={{ color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}>
                  ðŸ”„ OTP à¶±à·à·€à¶­ à¶ºà·€à¶±à·Šà¶±
                </span>
              )}
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginTop: 14, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1e40af' }}>ðŸ’¡ Email à¶‘à¶šà·š Inbox / Spam / Promotions folders à¶´à¶»à·“à¶šà·Šà·‚à· à¶šà¶»à¶±à·Šà¶±</div>
            </div>
          </div>
        )}

        {/* Step 5 â€” Done */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>âœ…</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 21, color: '#166534' }}>à·ƒà·à¶»à·Šà¶®à¶šà¶ºà·’!</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
              ðŸ“§ Password reset link email à¶‘à¶šà¶§ à¶ºà·€à· à¶‡à¶­. Inbox (spam à¶¯) à¶´à¶»à·“à¶šà·Šà·‚à· à¶šà¶»à¶±à·Šà¶±.
            </p>
            <PrimaryBtn onClick={onBack} bg="linear-gradient(135deg,#22c55e,#16a34a)">
              ðŸš€ Login Page
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN LOGIN â€” Default Export
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function Login() {
  const { login, loginWithGoogle, user } = useUserAuth();

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
    if (!email.trim() || !password) return setError('âŒ Email à·ƒà·„ à¶¸à·”à¶»à¶´à¶¯à¶º à¶‡à¶­à·”à·…à¶­à·Š à¶šà¶»à¶±à·Šà¶±');
    setLoading(true);
    const result = await login(email.trim(), password);
    if (!result.success) setError(result.error || 'Login à¶…à·ƒà·à¶»à·Šà¶®à¶š à·€à·’à¶º');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    const result = await loginWithGoogle();
    if (!result.success) setError(result.error || 'Google Sign-In à¶…à·ƒà·à¶»à·Šà¶®à¶š à·€à·’à¶º');
    setLoading(false);
  };

  if (screen === 'register') return <RegisterScreen onBack={() => setScreen('login')} />;
  if (screen === 'forgot') return <ForgotPasswordScreen onBack={() => setScreen('login')} />;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>ðŸª</div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, color: '#1e293b' }}>POS System</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>à¶”à¶¶à·š à¶œà·’à¶«à·”à¶¸à¶§ à¶‡à¶­à·”à·…à·” à·€à¶±à·Šà¶±</p>
        </div>

        <AlertBox msg={error} type="error" />

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 15 }}>
            <label style={labelStyle}>ðŸ“§ Email à¶½à·’à¶´à·’à¶±à¶º</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={inputStyle}
              disabled={loading} autoFocus required autoComplete="email" />
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>ðŸ”’ à¶¸à·”à¶»à¶´à¶¯à¶º</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="à¶”à¶¶à·š à¶¸à·”à¶»à¶´à¶¯à¶º"
                style={{ ...inputStyle, paddingRight: 44 }}
                disabled={loading} required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                {showPw ? 'ðŸ™ˆ' : 'ðŸ‘ï¸'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <span onClick={() => setScreen('forgot')}
              style={{ color: '#3b82f6', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ðŸ” à¶¸à·”à¶»à¶´à¶¯à¶º à¶…à¶¸à¶­à¶šà¶¯?
            </span>
          </div>

          <PrimaryBtn type="submit" loading={loading}>
            {loading ? 'â³ à¶‡à¶­à·”à¶½à·Š à·€à·™à¶¸à·’à¶±à·Š...' : 'ðŸš€ à¶‡à¶­à·”à¶½à·Š à·€à¶±à·Šà¶±'}
          </PrimaryBtn>
        </form>

        <OrDivider />
        <GoogleSignInBtn onClick={handleGoogleLogin} loading={loading} />

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
          <span style={{ color: '#64748b', fontSize: 14 }}>à¶œà·’à¶«à·”à¶¸à¶šà·Š à¶±à·à¶¯à·Šà¶¯? </span>
          <span onClick={() => setScreen('register')}
            style={{ color: '#3b82f6', fontWeight: 800, fontSize: 14, cursor: 'pointer', textDecoration: 'underline' }}>
            à¶±à·€ à¶œà·’à¶«à·”à¶¸à¶šà·Š à·ƒà·à¶¯à¶±à·Šà¶± â†’
          </span>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            ðŸ”’ Secure &nbsp;|&nbsp; ðŸ“§ Email OTP &nbsp;|&nbsp; ðŸ”µ Google
          </div>
        </div>
      </div>
    </div>
  );
}
