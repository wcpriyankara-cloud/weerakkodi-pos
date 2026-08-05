'use client';

// components/production/HistoryTab.jsx

import React, { useState, useMemo } from 'react';
import { nn, fmt, todayStr, getWeekStart, getMonthStart } from './utils';
import { PAY_OPTIONS } from './constants';
import ShareActions from './ShareActions';

export default function HistoryTab({
  entries,
  onDelete,
  t,
  lang,
  invSettings,
}) {
  const [search,     setSearch]     = useState('');
  const [dateRange,  setDateRange]  = useState('allTime');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [filterCust, setFilterCust] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expanded,   setExpanded]   = useState(null);

  const preset = (p) => {
    setDateRange(p);
    if (p === 'today')     { setFromDate(todayStr());      setToDate(todayStr()); }
    else if (p === 'thisWeek')  { setFromDate(getWeekStart());  setToDate(todayStr()); }
    else if (p === 'thisMonth') { setFromDate(getMonthStart()); setToDate(todayStr()); }
    else { setFromDate(''); setToDate(''); }
  };

  const custs = useMemo(() => {
    const n = new Set();
    entries.forEach((e) => { if (e.customerName) n.add(e.customerName); });
    return Array.from(n).sort();
  }, [entries]);

  const filtered = useMemo(() =>
    entries.filter((e) => {
      if (fromDate && e.date < fromDate) return false;
      if (toDate   && e.date > toDate)   return false;
      if (filterCust && (e.customerName || '') !== filterCust) return false;
      if (filterType === 'incomeOnly'  && nn(e.totalIncome) <= 0) return false;
      if (filterType === 'expenseOnly' && nn(e.totalCost) <= 0 && !e.isStandaloneExpense) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!`${e.customerName || ''} ${e.vehicleNumber || ''} ${e.batchNumber || ''} ${e.invoiceNumber || ''} ${e.date || ''}`.toLowerCase().includes(s))
          return false;
      }
      return true;
    }),
  [entries, fromDate, toDate, filterCust, filterType, search]);

  const tI = useMemo(() => filtered.reduce((s, e) => s + nn(e.totalIncome), 0), [filtered]);
  const tE = useMemo(() => filtered.reduce((s, e) => s + nn(e.totalCost),   0), [filtered]);

  const clear  = () => { setSearch(''); setDateRange('allTime'); setFromDate(''); setToDate(''); setFilterCust(''); setFilterType('all'); };
  const hasFilter = search || fromDate || toDate || filterCust || filterType !== 'all';
  const pmIcon = (m) => { const f = PAY_OPTIONS.find((p) => p.key === m); return f ? `${f.icon} ${f.label}` : m; };

  const inpStyle = { width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' };

  return (
    <div>
      {/* Filters */}
      <div style={{ background: 'white', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchHistory}
            style={{ width: '100%', padding: '11px 14px 11px 38px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>🔍</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['today', t.today], ['thisWeek', t.thisWeek], ['thisMonth', t.thisMonth], ['allTime', t.allTime]].map(([k, l]) => (
            <button key={k} onClick={() => preset(k)}
              style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: dateRange === k ? '2px solid #3b82f6' : '1px solid #e2e8f0', background: dateRange === k ? '#eff6ff' : 'white', color: dateRange === k ? '#2563eb' : '#64748b', minWidth: 60 }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{t.fromDate}</label>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setDateRange(''); }} style={inpStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{t.toDate}</label>
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setDateRange(''); }} style={inpStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={filterCust} onChange={(e) => setFilterCust(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
            <option value="">{t.allCustomers}</option>
            {custs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
            <option value="all">{t.all}</option>
            <option value="incomeOnly">⬇️ {t.incomeOnly}</option>
            <option value="expenseOnly">⬆️ {t.expenseOnly}</option>
          </select>
        </div>

        {hasFilter && (
          <button onClick={clear} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 12, width: '100%' }}>
            ✕ {t.clearFilters}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="prod-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: t.totalEntries, val: filtered.length, color: '#1e293b', bg: '#f8fafc' },
          { label: t.income,       val: `Rs.${fmt(tI)}`, color: '#16a34a', bg: '#f0fdf4' },
          { label: t.expense,      val: `Rs.${fmt(tE)}`, color: '#dc2626', bg: '#fef2f2' },
          { label: t.profit,       val: `Rs.${fmt(tI - tE)}`, color: tI - tE >= 0 ? '#0369a1' : '#dc2626', bg: '#f0f9ff' },
        ].map((item) => (
          <div key={item.label} style={{ background: item.bg, borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.label}</div>
            <div style={{ fontWeight: 900, fontSize: 16, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Entries */}
      {!filtered.length ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8' }}>📭 {t.noData}</div>
      ) : (
        filtered.map((e) => {
          const isO = expanded === e.id;
          return (
            <div key={e.id} style={{ background: 'white', borderRadius: 14, border: isO ? '2px solid #3b82f6' : '1px solid #eee', marginBottom: 10, overflow: 'hidden' }}>
              {/* Header row */}
              <div onClick={() => setExpanded(isO ? null : e.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>📅 {e.date}</span>
                    {e.shift && <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, color: '#64748b' }}>{t[e.shift] || e.shift}</span>}
                    {e.paymentStatus === 'paid'    && <span style={{ fontSize: 11, background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>✅</span>}
                    {e.paymentStatus === 'partial' && <span style={{ fontSize: 11, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>⏳</span>}
                    {e.paymentStatus === 'pending' && <span style={{ fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>📌</span>}
                    {e.isStandaloneExpense         && <span style={{ fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>💸</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {e.customerName  && `👤 ${e.customerName} `}
                    {e.vehicleNumber && `🚗 ${e.vehicleNumber} `}
                    {e.batchNumber   && `📋 ${e.batchNumber}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div>
                    {nn(e.totalIncome) > 0 && <div style={{ fontWeight: 900, color: '#16a34a', fontSize: 15 }}>⬇️ Rs.{fmt(e.totalIncome)}</div>}
                    {nn(e.totalCost)   > 0 && <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13 }}>⬆️ Rs.{fmt(e.totalCost)}</div>}
                  </div>
                  <span style={{ fontSize: 18, color: '#94a3b8', transform: isO ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isO && (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: 16, background: '#fafbfc' }}>
                  {e.invoiceNumber && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div style={{ background: '#eff6ff', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>🧾 {e.invoiceNumber}</div>
                      <div style={{ background: '#f8fafc', padding: '6px 12px', borderRadius: 8, fontSize: 12 }}>📋 {e.batchNumber}</div>
                    </div>
                  )}

                  {e.outputs?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#f59e0b', marginBottom: 8 }}>🪨 {t.outputProducts}</div>
                      {e.outputs.map((o, i) => {
                        const lt = nn(o.qty) * nn(o.unitPrice);
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                            <span>{o.product}: {nn(o.qty)} {o.unit}{nn(o.unitPrice) > 0 ? ` × Rs.${fmt(o.unitPrice)}` : ''}</span>
                            {lt > 0 && <span style={{ fontWeight: 700, color: '#16a34a' }}>Rs.{fmt(lt)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {e.serviceItems?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔧 {t.services}</div>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f1f5f9' }}><th style={{ textAlign: 'left', padding: '6px 10px' }}>Service</th><th style={{ textAlign: 'right', padding: '6px 10px' }}>Rate</th><th style={{ textAlign: 'right', padding: '6px 10px' }}>Total</th></tr></thead>
                        <tbody>
                          {e.serviceItems.map((si, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px' }}>{si.name || '-'}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>Rs.{fmt(si.rate)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>Rs.{fmt(nn(si.qty) * nn(si.rate))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {e.partsUsed?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔩 {t.parts}</div>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f1f5f9' }}><th style={{ textAlign: 'left', padding: '6px 10px' }}>Part</th><th style={{ textAlign: 'right', padding: '6px 10px' }}>Price</th><th style={{ textAlign: 'right', padding: '6px 10px' }}>Net</th></tr></thead>
                        <tbody>
                          {e.partsUsed.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px' }}>{p.name || '-'}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>Rs.{fmt(p.sellPrice)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>Rs.{fmt(nn(p.qty) * nn(p.sellPrice) * (1 - nn(p.discount) / 100))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {e.expenseItems?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#dc2626', marginBottom: 8 }}>💸</div>
                      {e.expenseItems.map((ex, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                          <span>{t[ex.category] || ex.category} — {ex.description || ex.itemName || ''}{nn(ex.qty) > 0 ? ` (${nn(ex.qty)}×Rs.${fmt(ex.unitPrice)})` : ''}</span>
                          <span style={{ fontWeight: 700, color: '#dc2626' }}>Rs.{fmt(nn(ex.qty) > 0 && nn(ex.unitPrice) > 0 ? nn(ex.qty) * nn(ex.unitPrice) : nn(ex.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {e.harvests?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#16a34a', marginBottom: 8 }}>🌿</div>
                      {e.harvests.map((h, i) => (
                        <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>
                          {h.crop}: {nn(h.qty)} {h.unit || 'kg'} × Rs.{fmt(h.pricePerUnit)} = <strong style={{ color: '#16a34a' }}>Rs.{fmt(nn(h.qty) * nn(h.pricePerUnit))}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {e.payments?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#0369a1', marginBottom: 8 }}>💳 {t.paymentMethod}</div>
                      {e.payments.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                          <span>{pmIcon(p.method)}</span>
                          <span style={{ fontWeight: 700 }}>Rs.{fmt(p.amount)}</span>
                        </div>
                      ))}
                      {nn(e.balanceDue) > 0 && (
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginTop: 6 }}>
                          📌 {t.balanceDue}: Rs.{fmt(e.balanceDue)}
                        </div>
                      )}
                    </div>
                  )}

                  {e.remark && (
                    <div style={{ marginBottom: 14, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: '#92400e', marginBottom: 4 }}>📝 {t.remark}</div>
                      <div style={{ fontSize: 13, color: '#78350f' }}>{e.remark}</div>
                    </div>
                  )}

                  <div style={{ marginBottom: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                    <ShareActions entry={e} invSettings={invSettings} lang={lang} phone={e.customerPhone || ''} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10, borderTop: '2px solid #e2e8f0' }}>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (window.confirm(t.deleteConfirm)) onDelete(e.id);
                      }}
                      style={{ padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}