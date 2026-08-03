'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, where, getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const DEFAULT_IMG =
  'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';

const WARRANTY_TYPES = [
  { value: '',             label: 'වගකීමක් නැත',    icon: '❌' },
  { value: 'manufacturer', label: 'නිෂ්පාදක වගකීම', icon: '🏭' },
  { value: 'shop',         label: 'සාප්පු වගකීම',   icon: '🏪' },
  { value: 'extended',     label: 'විස්තීරණ වගකීම', icon: '📋' },
  { value: 'limited',      label: 'සීමිත වගකීම',    icon: '⚠️' },
];

const WARRANTY_PERIODS = [
  { label: '7D',   value: '7 days',   desc: 'දින 7'     },
  { label: '1M',   value: '1 month',  desc: 'මාස 1'     },
  { label: '3M',   value: '3 months', desc: 'මාස 3'     },
  { label: '6M',   value: '6 months', desc: 'මාස 6'     },
  { label: '1Y',   value: '1 year',   desc: 'වසර 1'     },
  { label: '2Y',   value: '2 years',  desc: 'වසර 2'     },
  { label: 'Life', value: 'lifetime', desc: 'ජීවිත කාල' },
];

const INITIAL_FORM = {
  id: null,
  itemCode: '', barcode: '', barcodeImage: '',
  name: '', sinhalaName: '', modelKeyCode: '',
  brandId: '', brandName: '',
  categoryId: '', categoryName: '',
  subCategoryId: '', subCategoryName: '',
  uomId: '', uomName: '', availableUnits: [],
  isHidden: false, isPurchaseOnly: false,
  showPrice: true, showDiscount: true,
  allowOrderWhenOutOfStock: false,
  catalogPriceType: 'retail', catalogUom: '',
  colorId: '', colorName: '',
  rackId: '', rackName: '',
  supplierId: '', supplierName: '',
  minStockLevel: '', maxStockLevel: '',
  buyingPrice: '',
  sellingPriceRetail: '', retailDiscount: '', retailYourPrice: '',
  sellingPriceWholesale: '', wholesaleDiscount: '', wholesaleYourPrice: '',
  sellingPriceLoose: '', looseDiscount: '', looseYourPrice: '',
  vatEnabled: false, kot: false, description: '',
  images: [], imagePaths: [], picture: '',
  warrantyType: '', warrantyPeriod: '',
  warrantyTerms: '', warrantyNotes: '',
};

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const calcNet = (price, discount) => {
  const p = parseFloat(price || 0);
  const d = parseFloat(discount || 0);
  return (p - (p * d) / 100).toFixed(2);
};

const calcWarrantyExpiry = (period) => {
  if (!period) return '';
  const txt = String(period).toLowerCase().trim();
  if (txt === 'lifetime') return '♾️ ජීවිත කාල';
  const match = txt.match(
    /^(\d+)\s*(day|days|month|months|year|years|d|m|y)s?$/i
  );
  if (!match) return '';
  const qty  = parseInt(match[1], 10);
  const unit = match[2].charAt(0).toLowerCase();
  const d    = new Date();
  if (unit === 'd') d.setDate(d.getDate() + qty);
  if (unit === 'm') d.setMonth(d.getMonth() + qty);
  if (unit === 'y') d.setFullYear(d.getFullYear() + qty);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const compressImage = (source, maxWidth = 800, quality = 0.82) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width  = maxWidth;
      }
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg', quality
      );
    };
    img.onerror = reject;
    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof Blob || source instanceof File) {
      const reader = new FileReader();
      reader.onload  = (e) => { img.src = e.target.result; };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    } else {
      reject(new Error('Unsupported source'));
    }
  });

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: type === 'error' ? '#dc2626' : '#16a34a',
      color: 'white', padding: '14px 20px',
      borderRadius: 12, fontWeight: 700,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.3s ease',
      maxWidth: 320,
    }}>
      {message}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════
   TOGGLE ROW
══════════════════════════════════════════ */
function ToggleRow({ label, desc, checked, onChange, color = 'bg-blue-600' }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-3">
        <div className="font-medium text-gray-800 text-sm">{label}</div>
        {desc && (
          <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
        )}
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`w-11 h-6 bg-gray-200 rounded-full peer
          peer-checked:after:translate-x-full
          after:content-[''] after:absolute after:top-[2px] after:left-[2px]
          after:bg-white after:border after:rounded-full
          after:h-5 after:w-5 after:transition-all
          peer-checked:${color}`}
        />
      </label>
    </div>
  );
}

/* ══════════════════════════════════════════
   IMAGE UPLOAD SECTION
══════════════════════════════════════════ */
function ImageUploadSection({ formData, uid, itemId, onImagesChange }) {
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);

  const uploadToStorage = async (file) => {
    const blob     = await compressImage(file, 800, 0.82);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path     = `items/${uid}/${itemId || 'new'}/${filename}`;
    const fileRef  = storageRef(storage, path);
    const snap     = await uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
    });
    const url = await getDownloadURL(snap.ref);
    return { url, path };
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const newImages = [];
    const newPaths  = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`Uploading ${i + 1}/${files.length}...`);
      try {
        const { url, path } = await uploadToStorage(files[i]);
        newImages.push(url);
        newPaths.push(path);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    onImagesChange({
      images:     [...(formData.images || []), ...newImages],
      imagePaths: [...(formData.imagePaths || []), ...newPaths],
    });
    setUploading(false);
    setUploadProgress('');
  };

  const removeImage = async (idx) => {
    const imgs  = [...(formData.images || [])];
    const paths = [...(formData.imagePaths || [])];
    if (paths[idx] && imgs[idx]?.startsWith('https://')) {
      try {
        await deleteObject(storageRef(storage, paths[idx]));
      } catch {}
    }
    imgs.splice(idx, 1);
    paths.splice(idx, 1);
    onImagesChange({ images: imgs, imagePaths: paths });
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border">
      <label className="block font-bold mb-3 text-center">
        📷 භාණ්ඩ රූප
      </label>

      {(formData.images || []).length > 0 ? (
        <div className="flex overflow-x-auto gap-3 pb-3 mb-3">
          {(formData.images || []).map((img, idx) => (
            <div key={idx} className="relative shrink-0" style={{ minWidth: 100 }}>
              <div className="w-24 h-24 border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                <img
                  src={img}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = DEFAULT_IMG; }}
                  alt={`Image ${idx + 1}`}
                />
              </div>
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 bg-blue-600
                                 text-white text-[9px] px-1.5 py-0.5
                                 rounded font-bold">
                  Main
                </span>
              )}
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 bg-red-600 text-white
                           rounded-full w-6 h-6 flex items-center
                           justify-center text-xs font-bold shadow-md"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl
                        h-28 flex flex-col items-center justify-center
                        mb-3 bg-gray-50 text-gray-400">
          <div className="text-3xl mb-1">📷</div>
          <div className="text-sm">රූප නොමැත</div>
        </div>
      )}

      {uploading && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200
                        rounded-xl flex items-center gap-3">
          <div style={{
            width: 20, height: 20,
            border: '3px solid #bfdbfe',
            borderTopColor: '#2563eb',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
          }} />
          <span className="text-blue-700 text-sm font-bold">
            {uploadProgress}
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full bg-gray-100 text-gray-800 py-3 rounded-xl
                   font-bold hover:bg-gray-200 disabled:opacity-50
                   transition-colors"
      >
        📂 Gallery
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />

      <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-[10px] text-green-700 font-medium text-center">
          ☁️ රූප Firebase Storage වෙත upload වේ
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function ItemFormPage({ mode = 'add', itemId, onSuccess, onCancel }) {
  const { user } = useUserAuth();
  const router   = useRouter();

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [toast, setToast]       = useState(null);

  const [brands, setBrands]             = useState([]);
  const [categories, setCategories]     = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [uoms, setUoms]                 = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const [items, setItems]               = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  /* ── Load collections ── */
  useEffect(() => {
    if (!user?.uid) return;
    const cols = [
      { name: 'brands',        setter: setBrands },
      { name: 'categories',    setter: setCategories },
      { name: 'subCategories', setter: setSubCategories },
      { name: 'uoms',          setter: setUoms },
      { name: 'suppliers',     setter: setSuppliers },
      { name: 'items',         setter: setItems },
    ];
    const unsubs = cols.map(({ name, setter }) => {
      const q = query(
        collection(db, name),
        where('uid', '==', user.uid)
      );
      return onSnapshot(q, (snap) => {
        setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [user?.uid]);

  /* ── Load item for edit ── */
  useEffect(() => {
    if (mode !== 'edit' || !itemId || !user?.uid) {
      setIsLoading(false);
      return;
    }
    const loadItem = async () => {
      try {
        const snap = await getDoc(doc(db, 'items', itemId));
        if (snap.exists()) {
          const item = { id: snap.id, ...snap.data() };
          const itemImages = Array.isArray(item.images)
            ? item.images
            : item.picture ? [item.picture] : [];
          setFormData({
            ...INITIAL_FORM, ...item,
            images:     itemImages,
            imagePaths: Array.isArray(item.imagePaths) ? item.imagePaths : [],
          });
        }
      } catch (e) {
        showToast('Item load failed: ' + e.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    loadItem();
  }, [mode, itemId, user?.uid, showToast]);

  /* ── Auto item code ── */
  useEffect(() => {
    if (mode === 'add' && items.length >= 0) {
      setFormData((prev) => ({
        ...prev,
        itemCode: `ITM-${String(items.length + 1).padStart(5, '0')}`,
      }));
    }
  }, [mode, items.length]);

  /* ── Handle change ── */
  const handleChange = useCallback((field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      const priceFields = [
        'sellingPriceRetail', 'retailDiscount',
        'sellingPriceWholesale', 'wholesaleDiscount',
        'sellingPriceLoose', 'looseDiscount',
      ];
      if (priceFields.includes(field)) {
        next.retailYourPrice    = calcNet(next.sellingPriceRetail,    next.retailDiscount);
        next.wholesaleYourPrice = calcNet(next.sellingPriceWholesale, next.wholesaleDiscount);
        next.looseYourPrice     = calcNet(next.sellingPriceLoose,     next.looseDiscount);
      }
      return next;
    });
  }, []);

  const handleImagesChange = useCallback(({ images, imagePaths }) => {
    setFormData((prev) => ({ ...prev, images, imagePaths }));
  }, []);

  /* ── Add new doc to collection ── */
  const addNewDoc = useCallback(async (colName, value) => {
    if (!user) return null;
    try {
      const ref = await addDoc(collection(db, colName), {
        name:      value,
        uid:       user.uid,
        createdAt: new Date().toISOString(),
      });
      return ref.id;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [user]);

  /* ── Generate barcode ── */
  const generateBarcode = useCallback(() => {
    const code =
      Date.now().toString().slice(-8) +
      Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    handleChange('barcode', code);
  }, [handleChange]);

  /* ── Save ── */
  const saveItem = useCallback(async () => {
    if (!formData.name.trim()) {
      showToast('කරුණාකර නම ඇතුළත් කරන්න', 'error');
      return;
    }
    if (!user) {
      showToast('Login වී නෑ', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const { id, ...data } = formData;
      const allImages = data.images || [];
      const mainImage =
        allImages.find((img) => img?.startsWith('https://')) ||
        allImages.find((img) => img?.startsWith('data:')) || '';

      const payload = {
        ...data,
        uid:        user.uid,
        images:     allImages,
        imagePaths: data.imagePaths || [],
        imageUrl:   mainImage.startsWith('https://') ? mainImage : '',
        photoURL:   mainImage,
        picture:    mainImage,
        uom:        data.uomName,
        buyingPrice:            Number(data.buyingPrice)            || 0,
        sellingPriceRetail:     Number(data.sellingPriceRetail)     || 0,
        retailDiscount:         Number(data.retailDiscount)         || 0,
        retailYourPrice:        Number(data.retailYourPrice)        || 0,
        sellingPriceWholesale:  Number(data.sellingPriceWholesale)  || 0,
        wholesaleDiscount:      Number(data.wholesaleDiscount)      || 0,
        wholesaleYourPrice:     Number(data.wholesaleYourPrice)     || 0,
        sellingPriceLoose:      Number(data.sellingPriceLoose)      || 0,
        looseDiscount:          Number(data.looseDiscount)          || 0,
        looseYourPrice:         Number(data.looseYourPrice)         || 0,
        sellingPrice:           Number(data.sellingPriceRetail)     || 0,
        minStockLevel:          Number(data.minStockLevel)          || 0,
        maxStockLevel:          Number(data.maxStockLevel)          || 0,
        warrantyType:    data.warrantyType   || '',
        warrantyPeriod:  data.warrantyPeriod || '',
        warrantyTerms:   data.warrantyTerms  || '',
        warrantyNotes:   data.warrantyNotes  || '',
        isHidden:               data.isHidden               || false,
        isPurchaseOnly:         data.isPurchaseOnly         || false,
        showPrice:              data.showPrice              ?? true,
        showDiscount:           data.showDiscount           ?? true,
        allowOrderWhenOutOfStock: data.allowOrderWhenOutOfStock || false,
        catalogPriceType: data.catalogPriceType || 'retail',
        catalogUom:       data.catalogUom       || data.uomName || '',
      };

      if (mode === 'add') {
        await addDoc(collection(db, 'items'), {
          ...payload,
          stock:     0,
          stocks:    { Main_Store: 0 },
          createdAt: new Date().toISOString(),
        });
        showToast('සාර්ථකව සුරකින ලදී! ✅');
      } else if (mode === 'edit' && id) {
        await updateDoc(doc(db, 'items', id), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        showToast('සාර්ථකව යාවත්කාලීන කරන ලදී! ✅');
      }

      setTimeout(() => onSuccess?.(), 1500);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }, [formData, user, mode, onSuccess, showToast]);

  /* ══ LOADING STATE ══ */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div style={{
          width: 40, height: 40,
          border: '4px solid #e2e8f0',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ══ FORM ══ */
  return (
    <div className="min-h-screen bg-gray-100 pb-28">

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white p-4 sticky top-0 z-10 shadow-sm
                      flex items-center gap-3 border-b">
        <button
          onClick={onCancel}
          className="text-xl border-2 rounded-lg px-3 py-1
                     hover:bg-gray-100 transition-colors"
        >
          ←
        </button>
        <h1 className="font-bold text-lg">
          {mode === 'add' ? '➕ නව භාණ්ඩයක් එක් කරන්න' : '✏️ භාණ්ඩය සංස්කරණය'}
        </h1>
      </div>

      <div className="p-4 space-y-4">

        {/* ── VISIBILITY ── */}
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
          <h3 className="font-bold text-purple-800 mb-3 text-base">
            👁️ පාරිභෝගික දර්ශන සැකසුම්
          </h3>
          <div className="bg-white p-4 rounded-xl border border-purple-100
                          divide-y divide-dashed divide-gray-200">
            <ToggleRow
              label="🚫 සඟවන්න (Hidden)"
              desc="Catalog එකේ නොපෙනේ"
              checked={formData.isHidden}
              onChange={(v) => handleChange('isHidden', v)}
              color="peer-checked:bg-red-600"
            />
            <ToggleRow
              label="🚚 මිලදී ගැනීම් පමණි"
              checked={formData.isPurchaseOnly}
              onChange={(v) => handleChange('isPurchaseOnly', v)}
              color="peer-checked:bg-orange-500"
            />
            {!formData.isHidden && !formData.isPurchaseOnly && (
              <>
                <ToggleRow
                  label="💲 මිල පෙන්වන්න"
                  checked={formData.showPrice}
                  onChange={(v) => handleChange('showPrice', v)}
                  color="peer-checked:bg-green-600"
                />
                <ToggleRow
                  label="📦 තොග නැතිවිට ඇනවුම් ඉඩ දෙන්න"
                  desc="ON නම් Pre-Order කළ හැක"
                  checked={formData.allowOrderWhenOutOfStock}
                  onChange={(v) => handleChange('allowOrderWhenOutOfStock', v)}
                  color="peer-checked:bg-teal-600"
                />
              </>
            )}
          </div>
        </div>

        {/* ── IMAGE UPLOAD ── */}
        <ImageUploadSection
          formData={formData}
          uid={user?.uid}
          itemId={itemId}
          onImagesChange={handleImagesChange}
        />

        {/* ── BASIC INFO ── */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📋 මූලික තොරතුරු</h3>

          <div>
            <label className="font-bold text-sm block mb-1">🏷️ භාණ්ඩ කේතය</label>
            <input
              className="w-full border-2 p-3 rounded-xl bg-gray-100 text-gray-500"
              value={formData.itemCode}
              disabled
            />
          </div>

          <div>
            <label className="font-bold text-sm block mb-1">📊 බාර්කෝඩ්</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border-2 p-3 rounded-xl"
                value={formData.barcode}
                onChange={(e) => handleChange('barcode', e.target.value)}
                placeholder="Barcode..."
              />
              <button
                type="button"
                onClick={generateBarcode}
                className="bg-gray-200 px-4 rounded-xl font-bold hover:bg-gray-300"
              >
                ⚙️
              </button>
            </div>
          </div>

          <div>
            <label className="font-bold text-sm block mb-1">📝 නම (English) *</label>
            <input
              className="w-full border-2 p-3 rounded-xl"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Item name..."
            />
          </div>

          <div>
            <label className="font-bold text-sm block mb-1">🇱🇰 සිංහල නම</label>
            <input
              className="w-full border-2 p-3 rounded-xl"
              value={formData.sinhalaName}
              onChange={(e) => handleChange('sinhalaName', e.target.value)}
              placeholder="සිංහල නම..."
            />
          </div>

          <div>
            <label className="font-bold text-sm block mb-1">🔑 Model / Key Code</label>
            <input
              className="w-full border-2 p-3 rounded-xl"
              value={formData.modelKeyCode || ''}
              onChange={(e) => handleChange('modelKeyCode', e.target.value)}
            />
          </div>
        </div>

        {/* ── CLASSIFICATION ── */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📁 වර්ගීකරණය</h3>

          {[
            { label: 'සන්නාමය (Brand)', icon: '🏷️', idField: 'brandId', nameField: 'brandName', options: brands, col: 'brands' },
            { label: 'වර්ගය (Category)', icon: '📁', idField: 'categoryId', nameField: 'categoryName', options: categories, col: 'categories' },
            { label: 'සැපයුම්කරු', icon: '🚚', idField: 'supplierId', nameField: 'supplierName', options: suppliers, col: 'suppliers' },
          ].map((field) => (
            <SimpleSelect
              key={field.idField}
              label={`${field.icon} ${field.label}`}
              value={formData[field.idField]}
              displayValue={formData[field.nameField]}
              options={field.options}
              onSelect={(id, name) =>
                setFormData((prev) => ({
                  ...prev,
                  [field.idField]: id,
                  [field.nameField]: name,
                }))
              }
              onAddNew={(name) => addNewDoc(field.col, name)}
            />
          ))}

          {/* UOM */}
          <div>
            <label className="font-bold text-sm block mb-1">📐 මිනුම් ක්‍රමය</label>
            <select
              className="w-full border-2 p-3 rounded-xl bg-white"
              value={formData.uomId}
              onChange={(e) => {
                const uom = uoms.find((u) => u.id === e.target.value);
                setFormData((prev) => ({
                  ...prev,
                  uomId:          e.target.value,
                  uomName:        uom ? uom.fromUnitName : '',
                  availableUnits: uom ? (uom.conversions || []) : [],
                  catalogUom:     uom ? uom.fromUnitName : '',
                }));
              }}
            >
              <option value="">-- තෝරන්න --</option>
              {uoms.map((uom) => (
                <option key={uom.id} value={uom.id}>
                  {uom.fromUnitName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── PRICING ── */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">💰 මිල ගණන්</h3>

          <div>
            <label className="font-bold text-sm block mb-1">💵 ගැනුම් මිල</label>
            <input
              type="number" min="0" step="0.01"
              className="w-full border-2 p-3 rounded-xl bg-yellow-50 font-bold text-lg"
              value={formData.buyingPrice}
              onChange={(e) => handleChange('buyingPrice', e.target.value)}
              placeholder="0.00"
            />
          </div>

          {[
            { key: 'retail',    label: 'සිල්ලර',  icon: '🏪', priceF: 'sellingPriceRetail',    discF: 'retailDiscount',    netF: 'retailYourPrice',    bg: 'bg-blue-50',   border: 'border-blue-200' },
            { key: 'wholesale', label: 'තොග',     icon: '🏭', priceF: 'sellingPriceWholesale', discF: 'wholesaleDiscount', netF: 'wholesaleYourPrice', bg: 'bg-purple-50', border: 'border-purple-200' },
            { key: 'loose',     label: 'ලූස්',    icon: '📦', priceF: 'sellingPriceLoose',     discF: 'looseDiscount',     netF: 'looseYourPrice',     bg: 'bg-orange-50', border: 'border-orange-200' },
          ].map((pt) => (
            <div key={pt.key} className={`p-4 rounded-xl border ${pt.bg} ${pt.border}`}>
              <div className="font-bold mb-3">{pt.icon} {pt.label.toUpperCase()}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">මිල</label>
                  <input
                    type="number" min="0"
                    className="w-full border-2 p-2 rounded-lg text-center font-bold"
                    value={formData[pt.priceF]}
                    onChange={(e) => handleChange(pt.priceF, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">වට්ටම %</label>
                  <input
                    type="number" min="0" max="100"
                    className="w-full border-2 p-2 rounded-lg text-center"
                    value={formData[pt.discF]}
                    onChange={(e) => handleChange(pt.discF, e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">ඔබේ මිල</label>
                  <input
                    type="text"
                    className="w-full border-2 p-2 rounded-lg text-center
                               bg-green-100 font-bold text-green-700"
                    value={formData[pt.netF]}
                    readOnly
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── STOCK ── */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📊 තොග මට්ටම්</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold block mb-1">අවම</label>
              <input
                type="number" min="0"
                className="w-full border-2 p-3 rounded-xl"
                value={formData.minStockLevel}
                onChange={(e) => handleChange('minStockLevel', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-bold block mb-1">උපරිම</label>
              <input
                type="number" min="0"
                className="w-full border-2 p-3 rounded-xl"
                value={formData.maxStockLevel}
                onChange={(e) => handleChange('maxStockLevel', e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm">VAT</span>
            <input
              type="checkbox"
              checked={formData.vatEnabled}
              onChange={(e) => handleChange('vatEnabled', e.target.checked)}
              className="w-5 h-5"
            />
          </div>
          <textarea
            className="w-full border-2 p-3 rounded-xl"
            rows="2"
            placeholder="විස්තරය..."
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
          />
        </div>

        {/* ── WARRANTY ── */}
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-4 text-base">
            🛡️ වගකීම් තොරතුරු
          </h3>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-800 mb-2">
              📋 වගකීම් වර්ගය
            </label>
            <div className="grid grid-cols-2 gap-2">
              {WARRANTY_TYPES.map((wt) => (
                <button
                  key={wt.value}
                  type="button"
                  onClick={() => {
                    handleChange('warrantyType', wt.value);
                    if (!wt.value) {
                      handleChange('warrantyPeriod', '');
                      handleChange('warrantyTerms', '');
                      handleChange('warrantyNotes', '');
                    }
                  }}
                  className={`p-3 rounded-xl text-left font-bold text-sm
                    border-2 flex items-center gap-2 transition-all
                    ${formData.warrantyType === wt.value
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'
                    }`}
                >
                  <span>{wt.icon}</span>
                  <span className="text-xs">{wt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {formData.warrantyType && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  ⏰ වගකීම් කාලය
                </label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {WARRANTY_PERIODS.map((wp) => (
                    <button
                      key={wp.value}
                      type="button"
                      onClick={() => handleChange('warrantyPeriod', wp.value)}
                      className={`flex flex-col items-center px-3 py-2
                        rounded-xl border-2 font-bold text-xs transition-all
                        ${formData.warrantyPeriod === wp.value
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-amber-700 border-amber-200'
                        }`}
                    >
                      <span className="font-black">{wp.label}</span>
                      <span className="text-[9px] opacity-80">{wp.desc}</span>
                    </button>
                  ))}
                </div>
                <input
                  className="w-full border-2 border-amber-200 bg-white p-3
                             rounded-xl text-sm font-bold text-amber-800
                             placeholder-amber-300 outline-none
                             focus:border-amber-500"
                  value={formData.warrantyPeriod || ''}
                  onChange={(e) => handleChange('warrantyPeriod', e.target.value)}
                  placeholder="හෝ අතින් ඇතුළු කරන්න: 6 months / 1 year"
                />
                {formData.warrantyPeriod && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200
                                  rounded-xl text-center">
                    <div className="text-[10px] text-green-600 font-bold mb-1">
                      ✅ කල් ඉකුත් වන දිනය
                    </div>
                    <div className="text-base font-black text-green-800">
                      {calcWarrantyExpiry(formData.warrantyPeriod) || '—'}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  📜 වගකීම් කොන්දේසි
                </label>
                <textarea
                  value={formData.warrantyTerms || ''}
                  onChange={(e) => handleChange('warrantyTerms', e.target.value)}
                  rows={3}
                  className="w-full border-2 border-amber-100 bg-white p-3
                             rounded-xl text-sm outline-none
                             focus:border-amber-300 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  📝 අමතර සටහන්
                </label>
                <textarea
                  value={formData.warrantyNotes || ''}
                  onChange={(e) => handleChange('warrantyNotes', e.target.value)}
                  rows={2}
                  className="w-full border-2 border-amber-100 bg-white p-3
                             rounded-xl text-sm outline-none
                             focus:border-amber-300 resize-y"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── SAVE BUTTONS ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4
                      border-t flex gap-3 z-20 shadow-lg">
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 py-4 rounded-xl font-bold
                     hover:bg-gray-300 transition-colors"
        >
          ❌ අවලංගු
        </button>
        <button
          onClick={saveItem}
          disabled={isSaving}
          className={`flex-[2] py-4 rounded-xl font-bold text-white
            disabled:opacity-50 transition-colors
            ${mode === 'edit'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
            }`}
        >
          {isSaving
            ? '⏳ සුරකිමින්...'
            : mode === 'edit'
              ? '✅ යාවත්කාලීන කරන්න'
              : '💾 සුරකින්න'
          }
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SIMPLE SELECT
══════════════════════════════════════════ */
function SimpleSelect({ label, value, displayValue, options, onSelect, onAddNew }) {
  const [isOpen, setIsOpen]       = useState(false);
  const [search, setSearch]       = useState('');
  const [isAdding, setIsAdding]   = useState(false);
  const ref                       = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((opt) =>
    (opt.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setIsAdding(true);
    try {
      const newId = await onAddNew(search.trim());
      if (newId) {
        onSelect(newId, search.trim());
        setIsOpen(false);
        setSearch('');
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-bold text-gray-800 mb-1">
        {label}
      </label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="border-2 p-3 rounded-xl bg-white cursor-pointer
                   flex justify-between items-center shadow-sm
                   hover:border-blue-400 transition-colors"
      >
        <span className={value ? 'text-gray-900 font-medium' : 'text-gray-400'}>
          {value
            ? (options.find((o) => o.id === value)?.name || displayValue || 'Selected')
            : 'තෝරන්න...'}
        </span>
        <span className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div className="absolute z-30 w-full bg-white border-2 border-gray-200
                        mt-1 shadow-2xl max-h-64 overflow-hidden rounded-xl">
          <div className="sticky top-0 bg-white border-b">
            <input
              autoFocus
              className="w-full p-3 outline-none text-gray-900 bg-gray-50"
              placeholder="🔍 සොයන්න..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {value && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect('', '');
                  setIsOpen(false);
                }}
                className="p-3 hover:bg-red-50 cursor-pointer
                           border-b text-red-600 font-medium"
              >
                ✕ Clear
              </div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(opt.id, opt.name);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`p-3 hover:bg-blue-50 cursor-pointer border-b
                  last:border-0 ${value === opt.id
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-800'
                  }`}
              >
                {opt.name}
              </div>
            ))}
            {search && filtered.length === 0 && (
              <div
                onMouseDown={handleAdd}
                className="p-3 bg-green-50 text-green-700 font-bold
                           cursor-pointer hover:bg-green-100
                           flex justify-between items-center"
              >
                <span>➕ "{search}" එක් කරන්න</span>
                {isAdding && <span>⏳</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}