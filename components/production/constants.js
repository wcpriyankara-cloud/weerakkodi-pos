// components/production/constants.js

export const BUSINESS_TYPES = {
  quarry: {
    id: 'quarry',
    icon: '🪨',
    color: '#f59e0b',
    bg: '#fffbeb',
    si: 'ගල් කඩනුව',
    en: 'Stone Quarry',
  },
  cropFarm: {
    id: 'cropFarm',
    icon: '🌿',
    color: '#16a34a',
    bg: '#f0fdf4',
    si: 'බෝග ගොවිපල',
    en: 'Crop Farm',
  },
  vehicleRepair: {
    id: 'vehicleRepair',
    icon: '🔧',
    color: '#3b82f6',
    bg: '#eff6ff',
    si: 'වාහන අලුත්වැඩියා',
    en: 'Vehicle Repair',
  },
  tyreShop: {
    id: 'tyreShop',
    icon: '⭕',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    si: 'ටයර් වැඩ',
    en: 'Tyre Shop',
  },
  vehicleWash: {
    id: 'vehicleWash',
    icon: '🚿',
    color: '#06b6d4',
    bg: '#ecfeff',
    si: 'වාහන සෝදනය',
    en: 'Vehicle Wash',
  },
  custom: {
    id: 'custom',
    icon: '🏢',
    color: '#64748b',
    bg: '#f8fafc',
    si: 'වෙනත්',
    en: 'Custom Business',
  },
};

export const DEFAULT_QUARRY_PRODUCTS = [
  { id: 'stone34',   label: '3/4 Stone',  labelSi: '3/4 ගල්',   icon: '🪨' },
  { id: 'stone12',   label: '1/2 Stone',  labelSi: '1/2 ගල්',   icon: '🪨' },
  { id: 'stoneDust', label: 'Stone Dust', labelSi: 'ගල් කුඩු',  icon: '💨' },
  { id: 'chips',     label: 'Chips',      labelSi: 'චිප්ස්',    icon: '🔶' },
  { id: 'metal',     label: 'Metal',      labelSi: 'මෙටල්',     icon: '⚙️' },
  { id: 'sand',      label: 'Sand',       labelSi: 'වැලි',      icon: '🏖️' },
  { id: 'boulder',   label: 'Boulder',    labelSi: 'බොල්ඩර්',   icon: '🗿' },
  { id: 'baseRock',  label: 'Base Rock',  labelSi: 'Base Rock', icon: '🧱' },
  { id: 'rubble',    label: 'Rubble',     labelSi: 'රබල්',      icon: '🏗️' },
];

export const DEFAULT_CROP_TYPES = [
  { id: 'tea',       label: 'Tea',       labelSi: 'තේ',         icon: '🍃' },
  { id: 'coconut',   label: 'Coconut',   labelSi: 'පොල්',       icon: '🥥' },
  { id: 'rubber',    label: 'Rubber',    labelSi: 'රබර්',       icon: '🌳' },
  { id: 'cinnamon',  label: 'Cinnamon',  labelSi: 'කුරුඳු',     icon: '🪵' },
  { id: 'pepper',    label: 'Pepper',    labelSi: 'ගම්මිරිස්',  icon: '🌶️' },
  { id: 'clove',     label: 'Clove',     labelSi: 'කරාබු නැටි', icon: '🌿' },
  { id: 'paddy',     label: 'Paddy',     labelSi: 'වී',         icon: '🌾' },
  { id: 'vegetable', label: 'Vegetable', labelSi: 'එළවළු',      icon: '🥬' },
];

export const SHIFTS = ['morning', 'evening', 'night', 'fullDay'];

export const EXPENSE_CATS = [
  'diesel',
  'labour',
  'maintenance',
  'transport',
  'electricity',
  'water',
  'rent',
  'otherExpense',
];

export const PAY_OPTIONS = [
  { key: 'cash',   icon: '💵', label: 'Cash'   },
  { key: 'card',   icon: '💳', label: 'Card'   },
  { key: 'bank',   icon: '🏦', label: 'Bank'   },
  { key: 'online', icon: '📱', label: 'Online' },
  { key: 'cheque', icon: '📝', label: 'Cheque' },
  { key: 'credit', icon: '📌', label: 'Credit' },
];

export const PAY_TO_CASH = {
  cash:   'cash',
  card:   'card',
  bank:   'bank',
  online: 'online',
  cheque: 'cheque',
  credit: 'cash',
};

export const EXP_TO_CASH = {
  diesel:       'petrolExpense',
  labour:       'salary',
  maintenance:  'maintenance',
  transport:    'transport',
  electricity:  'utilities',
  water:        'utilities',
  rent:         'rent',
  otherExpense: 'other',
};

export const EXP_CAT_SI = {
  diesel:       'ඩීසල්',
  labour:       'කම්කරු',
  maintenance:  'නඩත්තු',
  transport:    'ප්‍රවාහනය',
  electricity:  'විදුලිය',
  water:        'ජලය',
  rent:         'කුලිය',
  otherExpense: 'වෙනත්',
};

export const BIZ_ICONS = [
  '🏢','🏭','🏗️','🔧','🔩','🛠️','🚗','🏪','🍳','🧵',
  '🪵','🧱','🎨','💈','🪴','🐄','🐔','🐟','🍞','🧊',
  '🧪','🖨️','📐','⚡','🪨','🌾','🏠','🔨','🪚','🧹',
];

export const BIZ_COLORS = [
  '#dc2626','#ea580c','#d97706','#16a34a','#059669',
  '#0891b2','#2563eb','#7c3aed','#c026d3','#e11d48',
  '#64748b','#0f172a',
];

export const QUARRY_OUTPUT_ICONS = [
  '🪨','💨','🔶','⚙️','🏖️','🗿','🧱','🏗️','📦',
  '🪵','🧊','⛰️','🏔️','🔸','🔹',
];

export const CROP_OUTPUT_ICONS = [
  '🍃','🥥','🌳','🪵','🌶️','🌿','🌾','🥬','🍎',
  '🥭','🍌','🌻','🌽','🫚','🧅','🥔',
];