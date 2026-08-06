'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useUserAuth } from '@/context/UserContext';
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, getDocs,
} from 'firebase/firestore';

/* ═══════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════ */
const T = {
  si: {
    title:             '⚙️ Catalog සැකසුම්',
    subtitle:          'පාරිභෝගිකයාට පෙනෙන තොරතුරු සහ ආකාරය සැකසන්න',
    catalogLink:       '🔗 Catalog Link',
    copyLink:          'Link Copy කරන්න',
    copied:            '✅ Copy කළා!',
    openCatalog:       '🌐 Catalog බලන්න',
    shareCatalog:      '💬 WhatsApp Share',
    shopInfo:          '🏪 වෙළඳසැල් තොරතුරු',
    shopName:          'වෙළඳසැලේ නම',
    phone:             'දුරකථන අංකය',
    whatsapp:          'WhatsApp අංකය',
    address:           'ලිපිනය',
    email:             'Email',
    logo:              'Logo URL',
    displaySettings:   '🎨 Display සැකසුම්',
    priceType:         'මිල වර්ගය',
    retail:            'සිල්ලර (Retail)',
    wholesale:         'තොග (Wholesale)',
    loose:             'Loose',
    showStock:         'තොග ප්‍රමාණය පෙන්වන්න',
    showBrand:         'Brand නම පෙන්වන්න',
    showCategory:      'Category පෙන්වන්න',
    showDescription:   'විස්තරය පෙන්වන්න',
    showSinhalaName:   'සිංහල නම පෙන්වන්න',
    showEnglishName:   'English නම පෙන්වන්න',
    showDiscount:      'වට්ටම් % පෙන්වන්න',
    showCart:          'කරත්ත බටනය පෙන්වන්න',
    showWhatsApp:      'WhatsApp බටනය පෙන්වන්න',
    showShare:         'Share බටනය පෙන්වන්න',
    save:              '💾 සුරකින්න',
    saving:            '⏳ සුරකිමින්...',
    saved:             '✅ සුරකින ලදී!',
    preview:           '👁️ පෙරදසුන',
    itemCount:         'ලියාපදිංචි භාණ්ඩ',
    yes:               'ඔව්',
    no:                'නැත',
    catalogEnabled:    'Catalog සක්‍රීය',
    catalogDisabled:   'Catalog අක්‍රීය',
    enableCatalog:     'Catalog ON/OFF',
  },
  en: {
    title:             '⚙️ Catalog Settings',
    subtitle:          'Configure how customers see your catalog',
    catalogLink:       '🔗 Catalog Link',
    copyLink:          'Copy Link',
    copied:            '✅ Copied!',
    openCatalog:       '🌐 Open Catalog',
    shareCatalog:      '💬 WhatsApp Share',
    shopInfo:          '🏪 Shop Information',
    shopName:          'Shop Name',
    phone:             'Phone Number',
    whatsapp:          'WhatsApp Number',
    address:           'Address',
    email:             'Email',
    logo:              'Logo URL',
    displaySettings:   '🎨 Display Settings',
    priceType:         'Price Type',
    retail:            'Retail',
    wholesale:         'Wholesale',
    loose:             'Loose',
    showStock:         'Show Stock Quantity',
    showBrand:         'Show Brand Name',
    showCategory:      'Show Category',
    showDescription:   'Show Description',
    showSinhalaName:   'Show Sinhala Name',
    showEnglishName:   'Show English Name',
    showDiscount:      'Show Discount %',
    showCart:          'Show Cart Button',
    showWhatsApp:      'Show WhatsApp Button',
    showShare:         'Show Share Button',
    save:              '💾 Save',
    saving:            '⏳ Saving...',
    saved:             '✅ Saved!',
    preview:           '👁️ Preview',
    itemCount:         'Registered Items',
    yes:               'Yes',
    no:                'No',
    catalogEnabled:    'Catalog Active',
    catalogDisabled:   'Catalog Inactive',
    enableCatalog:     'Catalog ON/OFF',
  },
};

/* ═══════════════════════════════════════
   STYLES
═══════════════════════════════════════ */
const S = {
  wrap:  { maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'system-ui, sans-serif' },
  card:  { background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', marginBottom: 16 },
  cardH: { margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#1e293b' },
  inp:   { width: '100%', padding: 12, borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 },
  row:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
};

/* ═══════════════════════════════════════
   TOGGLE SWITCH
═══════════════════════════════════════ */
function Toggle({ value, onChange, label }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
        background: value ? '#f0fdf4' : '#f8fafc',
        border: `1px solid ${value ? '#86efac' : '#e2e8f0'}`,
        marginBottom: 8, transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{label}</span>
      <div style={{
        width: 42, height: 24, borderRadius: 12, padding: 2,
        background: value ? '#16a34a' : '#cbd5e1', transition: 'background 0.2s',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s',
          transform: value ? 'translateX(18px)' : 'translateX(0)',
        }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function CatalogSettings() {
  const { user } = useUserAuth();

  const [lang, setLang] = useState('si');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'si' || saved === 'en') setLang(saved);
    } catch {}
    const h = (e) => { if (e.detail === 'si' || e.detail === 'en') setLang(e.detail); };
    window.addEventListener('app-language-change', h);
    return () => window.removeEventListener('app-language-change', h);
  }, []);
  const t = T[lang] || T.si;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [copied,  setCopied]  = useState(false);
  const [itemCount, setItemCount] = useState(0);

  const [settings, setSettings] = useState({
    shopName:        '',
    phone:           '',
    whatsapp:        '',
    address:         '',
    email:           '',
    logo:            '',
    catalogEnabled:  true,
    priceType:       'retail',
    showStock:       false,
    showBrand:       true,
    showCategory:    true,
    showDescription: true,
    showSinhalaName: true,
    showEnglishName: true,
    showDiscount:    true,
    showCart:        true,
    showWhatsApp:    true,
    showShare:       true,
  });

  const setField = (k, v) => setSettings((p) => ({ ...p, [k]: v }));

  const catalogUrl = useMemo(() => {
    if (!user?.uid) return '';
    const base = process.env.NEXT_PUBLIC_CATALOG_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${base}/pfi/${user.uid}`;
  }, [user?.uid]);

  // Load settings
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      try {
        // Load from catalogSettings doc
        const snap = await getDoc(doc(db, 'catalogSettings', user.uid));
        if (!cancelled && snap.exists()) {
          setSettings((prev) => ({ ...prev, ...snap.data() }));
        }

        // Also try user doc for shop info
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled && userSnap.exists()) {
          const ud = userSnap.data();
          setSettings((prev) => ({
            ...prev,
            shopName: prev.shopName || ud.shopName || ud.businessName || ud.displayName || '',
            phone:    prev.phone    || ud.phone    || ud.contactPhone || '',
            whatsapp: prev.whatsapp || ud.whatsapp || '',
            address:  prev.address  || ud.address  || '',
            email:    prev.email    || ud.email    || '',
            logo:     prev.logo     || ud.logo     || ud.photoURL || '',
          }));
        }

        // Count items
        const itemsSnap = await getDocs(
          query(collection(db, 'items'), where('uid', '==', user.uid))
        );
        if (!cancelled) setItemCount(itemsSnap.size);
      } catch (err) {
        console.warn('Load catalog settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Save
  const handleSave = useCallback(async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'catalogSettings', user.uid), {
        ...settings,
        uid: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Also update user doc shop info
      await setDoc(doc(db, 'users', user.uid), {
        shopName: settings.shopName,
        phone:    settings.phone,
        whatsapp: settings.whatsapp,
        address:  settings.address,
        email:    settings.email,
        logo:     settings.logo,
      }, { merge: true });

      setToast(t.saved);
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }, [user?.uid, settings, t.saved]);

  // Copy link
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(catalogUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = catalogUrl;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [catalogUrl]);

  // WhatsApp share
  const handleWhatsAppShare = useCallback(() => {
    const msg = encodeURIComponent(
      `🏪 ${settings.shopName || 'Our Shop'}\n\n📦 භාණ්ඩ නාමාවලිය බලන්න:\n${catalogUrl}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }, [catalogUrl, settings.shopName]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#16a34a', color: 'white', padding: '12px 24px',
          borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#1e293b' }}>{t.title}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{t.subtitle}</p>
      </div>

      {/* ═══ CATALOG LINK ═══ */}
      <div style={{ ...S.card, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '2px solid #93c5fd' }}>
        <h3 style={S.cardH}>{t.catalogLink}</h3>

        {/* Link display */}
        <div style={{
          padding: '14px 16px', background: 'white', borderRadius: 12,
          border: '2px solid #3b82f6', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: 18 }}>🔗</span>
          <code style={{
            flex: 1, fontSize: 13, fontWeight: 700, color: '#1d4ed8',
            wordBreak: 'break-all', fontFamily: 'monospace',
          }}>
            {catalogUrl}
          </code>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleCopy} style={{
            flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 12,
            border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer',
            background: copied ? '#16a34a' : '#3b82f6', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {copied ? t.copied : `📋 ${t.copyLink}`}
          </button>

          <a href={catalogUrl} target="_blank" rel="noopener noreferrer" style={{
            flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 12,
            border: '2px solid #3b82f6', fontWeight: 800, fontSize: 13,
            background: 'white', color: '#1d4ed8', textDecoration: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {t.openCatalog}
          </a>

          <button onClick={handleWhatsAppShare} style={{
            flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 12,
            border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer',
            background: '#25d366', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {t.shareCatalog}
          </button>
        </div>

        {/* Item count */}
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 10,
          background: 'white', border: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            📦 {t.itemCount}
          </span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#3b82f6' }}>
            {itemCount}
          </span>
        </div>
      </div>

      {/* ═══ SHOP INFO ═══ */}
      <div style={S.card}>
        <h3 style={S.cardH}>{t.shopInfo}</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>{t.shopName}</label>
          <input value={settings.shopName} onChange={(e) => setField('shopName', e.target.value)} style={S.inp} placeholder="Weerakkodi Shop" />
        </div>

        <div style={S.row}>
          <div>
            <label style={S.label}>{t.phone}</label>
            <input value={settings.phone} onChange={(e) => setField('phone', e.target.value)} style={S.inp} placeholder="077 XXX XXXX" type="tel" />
          </div>
          <div>
            <label style={S.label}>{t.whatsapp}</label>
            <input value={settings.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} style={S.inp} placeholder="077 XXX XXXX" type="tel" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>{t.address}</label>
          <textarea value={settings.address} onChange={(e) => setField('address', e.target.value)} style={{ ...S.inp, height: 70, resize: 'vertical', fontFamily: 'inherit' }} placeholder="No 123, Main Street, Colombo" />
        </div>

        <div style={S.row}>
          <div>
            <label style={S.label}>{t.email}</label>
            <input value={settings.email} onChange={(e) => setField('email', e.target.value)} style={S.inp} placeholder="shop@example.com" type="email" />
          </div>
          <div>
            <label style={S.label}>{t.logo}</label>
            <input value={settings.logo} onChange={(e) => setField('logo', e.target.value)} style={S.inp} placeholder="https://..." />
          </div>
        </div>

        {settings.logo && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <img src={settings.logo} alt="Logo" style={{ maxHeight: 80, borderRadius: 12, border: '2px solid #e2e8f0' }} onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        )}
      </div>

      {/* ═══ DISPLAY SETTINGS ═══ */}
      <div style={S.card}>
        <h3 style={S.cardH}>{t.displaySettings}</h3>

        {/* Catalog ON/OFF */}
        <Toggle value={settings.catalogEnabled} onChange={(v) => setField('catalogEnabled', v)} label={`🌐 ${t.enableCatalog}`} />

        {/* Price Type */}
        <div style={{ marginBottom: 14, marginTop: 14 }}>
          <label style={S.label}>{t.priceType}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'retail',    label: t.retail,    icon: '🏪' },
              { key: 'wholesale', label: t.wholesale, icon: '📦' },
              { key: 'loose',     label: t.loose,     icon: '⚖️' },
            ].map((pt) => (
              <button key={pt.key} onClick={() => setField('priceType', pt.key)} style={{
                flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, textAlign: 'center',
                border: settings.priceType === pt.key ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                background: settings.priceType === pt.key ? '#eff6ff' : 'white',
                color: settings.priceType === pt.key ? '#2563eb' : '#64748b',
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{pt.icon}</div>
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Toggle value={settings.showSinhalaName} onChange={(v) => setField('showSinhalaName', v)} label={t.showSinhalaName} />
          <Toggle value={settings.showEnglishName} onChange={(v) => setField('showEnglishName', v)} label={t.showEnglishName} />
          <Toggle value={settings.showBrand}       onChange={(v) => setField('showBrand', v)}       label={t.showBrand} />
          <Toggle value={settings.showCategory}    onChange={(v) => setField('showCategory', v)}    label={t.showCategory} />
          <Toggle value={settings.showDescription} onChange={(v) => setField('showDescription', v)} label={t.showDescription} />
          <Toggle value={settings.showDiscount}    onChange={(v) => setField('showDiscount', v)}    label={t.showDiscount} />
          <Toggle value={settings.showStock}       onChange={(v) => setField('showStock', v)}       label={t.showStock} />
          <Toggle value={settings.showCart}        onChange={(v) => setField('showCart', v)}        label={t.showCart} />
          <Toggle value={settings.showWhatsApp}    onChange={(v) => setField('showWhatsApp', v)}    label={t.showWhatsApp} />
          <Toggle value={settings.showShare}       onChange={(v) => setField('showShare', v)}       label={t.showShare} />
        </div>
      </div>

      {/* ═══ SAVE BUTTON ═══ */}
      <button onClick={handleSave} disabled={saving} style={{
        width: '100%', padding: 16, borderRadius: 14, border: 'none',
        background: saving ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: 'white', fontWeight: 900, fontSize: 16,
        cursor: saving ? 'not-allowed' : 'pointer',
        boxShadow: saving ? 'none' : '0 4px 12px rgba(59,130,246,0.3)',
      }}>
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}