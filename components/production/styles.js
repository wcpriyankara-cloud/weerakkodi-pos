// components/production/styles.js

export const S = {
  wrap: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: 20,
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    flexWrap: 'wrap',
    gap: 15,
  },
  tabs: {
    display: 'flex',
    gap: 8,
    background: '#f1f5f9',
    padding: 5,
    borderRadius: 12,
    flexWrap: 'wrap',
  },
  tab: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: 10,
    background: 'transparent',
    color: '#64748b',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 13,
  },
  tabOn: {
    background: 'white',
    color: '#1e293b',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  },
  card: {
    background: 'white',
    padding: 20,
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
    marginBottom: 15,
  },
  cardH: {
    margin: '0 0 15px 0',
    fontSize: 16,
    color: '#334155',
    fontWeight: 800,
  },
  row2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 15,
  },
  inp: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    boxSizing: 'border-box',
    fontSize: 14,
  },
  addBtn: {
    padding: 12,
    borderRadius: 10,
    border: '1px dashed #3b82f6',
    background: '#f0f9ff',
    color: '#2563eb',
    cursor: 'pointer',
    fontWeight: 700,
    width: '100%',
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    border: 'none',
    background: '#16a34a',
    color: 'white',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
  },
  delBtn: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    padding: '10px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    flexShrink: 0,
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60vh',
    flexDirection: 'column',
    gap: 16,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 100,
    maxHeight: 220,
    overflowY: 'auto',
  },
  dropItem: {
    padding: '10px 14px',
    borderBottom: '1px solid #f8fafc',
    cursor: 'pointer',
    fontSize: 14,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 5000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
};

export const responsiveStyles = `
  @media(max-width:768px){
    .prod-wrap{padding:12px!important}
    .prod-date-grid{grid-template-columns:1fr!important}
    .prod-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    .prod-service-row{grid-template-columns:1fr!important}
    .prod-part-grid{grid-template-columns:1fr!important}
    .prod-output-row{flex-direction:column!important}
    .prod-harvest-row{flex-direction:column!important}
    .prod-top-actions{flex-wrap:wrap!important}
    .prod-top-actions>button{flex:1 1 calc(50% - 6px)!important}
    .prod-header{flex-direction:column!important;gap:10px!important}
    .prod-tabs{width:100%!important;justify-content:center!important}
    .prod-quarry-grid{grid-template-columns:1fr 1fr!important}
  }
  @media(max-width:480px){
    .prod-wrap{padding:8px!important}
    .prod-summary-grid{grid-template-columns:1fr!important}
    .prod-top-actions>button{flex:1 1 100%!important}
    .prod-expense-grid{grid-template-columns:1fr!important}
    .prod-quarry-grid{grid-template-columns:1fr!important}
  }
  @media print{
    body *{visibility:hidden!important}
    #prod-print-area,#prod-print-area *{visibility:visible!important;color:#000!important}
    #prod-print-area{
      position:absolute!important;
      left:0!important;
      top:0!important;
      width:80mm!important;
      font-family:'Courier New',monospace!important;
      background:#fff!important;
      padding:4mm!important;
      font-size:11px!important;
      line-height:1.4!important
    }
    .no-print{display:none!important}
    @page{size:80mm auto;margin:2mm}
  }
`;