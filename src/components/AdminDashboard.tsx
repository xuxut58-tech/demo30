import { useEffect, useMemo, useState, type FormEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  BadgeDollarSign,
  Check,
  Download,
  Factory as FactoryIcon,
  FileSpreadsheet,
  History,
  KeyRound,
  Layers,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  currencySymbol,
  formatCurrency,
  formatWeightKg,
  formatWeightTons,
  getLocalizedFactoryName,
  getLocalizedGradeName,
  getLocalizedGradeSpec,
  TRANSLATIONS,
} from '../i18n';
import type { ActivityEventType, ActivityLog, AdminOverviewData, Currency, Factory, Grade, Lang } from '../types';
import { LanguageSwitcher } from './LanguageSwitcher';

interface AdminDashboardProps {
  adminUsername: string;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onLogout: () => void;
}

type AdminTab = 'overview' | 'pricing' | 'factories' | 'grades' | 'activity';

function priceKey(factoryId: string, gradeId: string): string {
  return `${factoryId}:${gradeId}`;
}

export function AdminDashboard({ adminUsername, lang, onLangChange, onLogout }: AdminDashboardProps) {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Per-factory unit prices & currency (key: `${factoryId}:${gradeId}`)
  const [draftCurrency, setDraftCurrency] = useState<Currency>('CNY');
  const [draftFactoryPrices, setDraftFactoryPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  // Optional batch fill helper in Unit Pricing tab
  const [batchGradeId, setBatchGradeId] = useState<string>('');
  const [batchPriceInput, setBatchPriceInput] = useState<string>('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');

  // Activity Log Filters
  const [activityTypeFilter, setActivityTypeFilter] = useState<'ALL' | ActivityEventType>('ALL');
  const [activityFactoryFilter, setActivityFactoryFilter] = useState<string>('ALL');
  const [activitySearch, setActivitySearch] = useState('');

  // Inspect/Adjust Factory Modal
  const [inspectFactory, setInspectFactory] = useState<Factory | null>(null);
  const [adjustQuantities, setAdjustQuantities] = useState<Record<string, string>>({});
  const [adjustPrices, setAdjustPrices] = useState<Record<string, string>>({});
  const [adjustNotes, setAdjustNotes] = useState<Record<string, string>>({});
  const [adjustGeneralNote, setAdjustGeneralNote] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Create / Edit Factory Modal
  const [factoryModalOpen, setFactoryModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [fCode, setFCode] = useState('');
  const [fNameZh, setFNameZh] = useState('');
  const [fNameEn, setFNameEn] = useState('');
  const [fNameVi, setFNameVi] = useState('');
  const [fRegion, setFRegion] = useState('VN');
  const [fLocation, setFLocation] = useState('');
  const [fUsername, setFUsername] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fActive, setFActive] = useState(true);
  const [savingFactory, setSavingFactory] = useState(false);
  const [pendingDeleteFactoryId, setPendingDeleteFactoryId] = useState<string | null>(null);

  // Change Main Password Modal
  const [adminPwdModalOpen, setAdminPwdModalOpen] = useState(false);
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [confirmAdminPwd, setConfirmAdminPwd] = useState('');
  const [savingAdminPwd, setSavingAdminPwd] = useState(false);

  // Create / Edit Grade Modal
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [gCode, setGCode] = useState('');
  const [gNameZh, setGNameZh] = useState('');
  const [gNameEn, setGNameEn] = useState('');
  const [gNameVi, setGNameVi] = useState('');
  const [gSpecZh, setGSpecZh] = useState('');
  const [gSpecEn, setGSpecEn] = useState('');
  const [gSpecVi, setGSpecVi] = useState('');
  const [gActive, setGActive] = useState(true);
  const [savingGrade, setSavingGrade] = useState(false);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const overview = await api.getAdminOverview();
      setData(overview);
      setDraftCurrency(overview.currency);

      const fpMap: Record<string, string> = {};
      for (const fp of overview.factoryPrices) {
        fpMap[priceKey(fp.factoryId, fp.gradeId)] = String(fp.unitPrice);
      }
      setDraftFactoryPrices(fpMap);

      const firstActive = overview.grades.find((g) => g.isActive);
      if (firstActive && !batchGradeId) {
        setBatchGradeId(firstActive.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const activeGrades = useMemo(() => {
    if (!data) return [];
    return data.grades.filter((g) => g.isActive);
  }, [data]);

  const invLookup = useMemo(() => {
    const map = new Map<string, Map<string, { quantityKg: number; note: string; updatedAt: string }>>();
    if (!data) return map;
    for (const item of data.inventory) {
      if (!map.has(item.factoryId)) {
        map.set(item.factoryId, new Map());
      }
      map.get(item.factoryId)!.set(item.gradeId, {
        quantityKg: item.quantityKg,
        note: item.note,
        updatedAt: item.updatedAt,
      });
    }
    return map;
  }, [data]);

  const effectiveUnitPrice = (factoryId: string, gradeId: string): number => {
    const raw = draftFactoryPrices[priceKey(factoryId, gradeId)];
    if (raw === undefined || raw === '') return 0;
    const val = Number(raw);
    return Number.isFinite(val) && val >= 0 ? val : 0;
  };

  const filteredFactories = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.factories.filter((f) => {
      if (regionFilter !== 'ALL' && f.region !== regionFilter) return false;
      if (!q) return true;
      return (
        f.code.toLowerCase().includes(q) ||
        f.nameZh.toLowerCase().includes(q) ||
        f.nameEn.toLowerCase().includes(q) ||
        f.nameVi.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q) ||
        f.location.toLowerCase().includes(q)
      );
    });
  }, [data, searchQuery, regionFilter]);

  const networkStats = useMemo(() => {
    if (!data) {
      return {
        totalKg: 0,
        totalValue: 0,
        activeFactories: 0,
        passwordReadyFactories: 0,
        gradeTotalsKg: new Map<string, number>(),
        gradeTotalsValue: new Map<string, number>(),
        hasMissingPrices: false,
      };
    }
    const gradeTotalsKg = new Map<string, number>();
    const gradeTotalsValue = new Map<string, number>();
    let totalKg = 0;
    let totalValue = 0;
    let hasMissingPrices = false;

    for (const f of data.factories) {
      const fMap = invLookup.get(f.id);
      for (const g of activeGrades) {
        const qty = fMap?.get(g.id)?.quantityKg ?? 0;
        const price = effectiveUnitPrice(f.id, g.id);
        if (qty > 0 && price <= 0) {
          hasMissingPrices = true;
        }
        const val = qty * price;
        totalKg += qty;
        totalValue += val;
        gradeTotalsKg.set(g.id, (gradeTotalsKg.get(g.id) ?? 0) + qty);
        gradeTotalsValue.set(g.id, (gradeTotalsValue.get(g.id) ?? 0) + val);
      }
    }

    return {
      totalKg,
      totalValue,
      activeFactories: data.factories.filter((f) => f.isActive).length,
      passwordReadyFactories: data.factories.filter((f) => f.hasPassword).length,
      gradeTotalsKg,
      gradeTotalsValue,
      hasMissingPrices,
    };
  }, [data, invLookup, activeGrades, draftFactoryPrices]);

  const filteredTotals = useMemo(() => {
    const gradeTotalsKg = new Map<string, number>();
    const gradeTotalsValue = new Map<string, number>();
    let totalKg = 0;
    let totalValue = 0;

    for (const f of filteredFactories) {
      const fMap = invLookup.get(f.id);
      for (const g of activeGrades) {
        const qty = fMap?.get(g.id)?.quantityKg ?? 0;
        const val = qty * effectiveUnitPrice(f.id, g.id);
        totalKg += qty;
        totalValue += val;
        gradeTotalsKg.set(g.id, (gradeTotalsKg.get(g.id) ?? 0) + qty);
        gradeTotalsValue.set(g.id, (gradeTotalsValue.get(g.id) ?? 0) + val);
      }
    }
    return { totalKg, totalValue, gradeTotalsKg, gradeTotalsValue };
  }, [filteredFactories, invLookup, activeGrades, draftFactoryPrices]);

  const lastLoginByFactory = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const log of data.activityLogs) {
      if (log.eventType === 'login' && log.factoryId && !map.has(log.factoryId)) {
        map.set(log.factoryId, log.createdAt);
      }
    }
    return map;
  }, [data]);

  const activityCounts = useMemo(() => {
    const counts = {
      all: 0,
      inventory_update: 0,
      login: 0,
      price_change: 0,
    };
    if (!data) return counts;
    counts.all = data.activityLogs.length;
    for (const log of data.activityLogs) {
      if (log.eventType === 'inventory_update') counts.inventory_update += 1;
      else if (log.eventType === 'login') counts.login += 1;
      else if (log.eventType === 'price_change') counts.price_change += 1;
    }
    return counts;
  }, [data]);

  const getActivityFactoryName = (log: ActivityLog): string => {
    if (lang === 'zh') return log.factoryNameZh || log.factoryNameEn || log.factoryCode;
    if (lang === 'vi') return log.factoryNameVi || log.factoryNameEn || log.factoryNameZh || log.factoryCode;
    return log.factoryNameEn || log.factoryNameZh || log.factoryCode;
  };

  const filteredActivityLogs = useMemo(() => {
    if (!data) return [];
    const q = activitySearch.trim().toLowerCase();
    return data.activityLogs.filter((log) => {
      if (activityTypeFilter !== 'ALL' && log.eventType !== activityTypeFilter) return false;
      if (activityFactoryFilter !== 'ALL' && log.factoryId !== activityFactoryFilter) return false;
      if (!q) return true;
      return (
        log.factoryCode.toLowerCase().includes(q) ||
        log.factoryNameZh.toLowerCase().includes(q) ||
        log.factoryNameEn.toLowerCase().includes(q) ||
        log.factoryNameVi.toLowerCase().includes(q) ||
        log.actorUsername.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.note.toLowerCase().includes(q)
      );
    });
  }, [data, activityTypeFilter, activityFactoryFilter, activitySearch]);

  const getFactoryLastUpdated = (factoryId: string): string | null => {
    const fMap = invLookup.get(factoryId);
    if (!fMap || fMap.size === 0) return null;
    let latest = '';
    for (const v of fMap.values()) {
      if (v.updatedAt > latest) latest = v.updatedAt;
    }
    return latest || null;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return t.neverUpdated;
    try {
      return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : lang === 'vi' ? 'vi-VN' : 'en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getEventStyle = (eventType: ActivityEventType) => {
    if (eventType === 'inventory_update') {
      return { label: t.eventInventoryUpdate, className: 'text-emerald-700 font-semibold' };
    }
    if (eventType === 'price_change') {
      return { label: t.eventPriceChange, className: 'text-amber-700 font-semibold' };
    }
    return { label: t.eventLogin, className: 'text-sky-700 font-semibold' };
  };

  const formatActivityDetail = (log: ActivityLog) => {
    if (log.eventType === 'login') {
      return log.details ? `${t.signedInDetail} (${log.details})` : t.signedInDetail;
    }
    const base = log.details || '—';
    return log.note ? `${base} — ${log.note}` : base;
  };

  const handleExportActivityCsv = () => {
    const headers = [
      t.colTime,
      t.colEventType,
      t.factoryCode,
      t.colFactory,
      t.colActor,
      t.colTotalWeight,
      t.colDetails,
    ];
    const rows = filteredActivityLogs.map((log) => [
      log.createdAt,
      getEventStyle(log.eventType).label,
      log.factoryCode,
      getActivityFactoryName(log),
      `${log.actorUsername} (${log.actorRole === 'admin' ? t.roleAdmin : t.roleFactory})`,
      log.eventType === 'inventory_update' ? `${log.totalKg} kg` : '',
      formatActivityDetail(log),
    ]);
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `durian_activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAllFactoryPrices = async () => {
    if (!data) return;
    setError('');
    setSavingPrices(true);
    try {
      const prices: { factoryId: string; gradeId: string; unitPrice: number }[] = [];
      for (const f of data.factories) {
        for (const g of data.grades) {
          prices.push({
            factoryId: f.id,
            gradeId: g.id,
            unitPrice: effectiveUnitPrice(f.id, g.id),
          });
        }
      }
      const res = await api.updateFactoryPrices(draftCurrency, prices, {
        factories: data.factories,
        grades: data.grades,
        previousPrices: data.factoryPrices,
        previousCurrency: data.currency,
      });
      const overview = await api.getAdminOverview();
      setData(overview);
      setDraftCurrency(res.currency);
      const fpMap: Record<string, string> = {};
      for (const fp of res.factoryPrices) {
        fpMap[priceKey(fp.factoryId, fp.gradeId)] = String(fp.unitPrice);
      }
      setDraftFactoryPrices(fpMap);
      showNotice(t.pricesSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSavingPrices(false);
    }
  };

  const handleApplyBatchPrice = () => {
    if (!batchGradeId) return;
    const num = Number(batchPriceInput);
    if (!Number.isFinite(num) || num < 0) return;
    setDraftFactoryPrices((prev) => {
      const next = { ...prev };
      for (const f of filteredFactories) {
        next[priceKey(f.id, batchGradeId)] = String(num);
      }
      return next;
    });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const headers: string[] = [
      'Factory Code',
      'Factory Name',
      'Region',
      'Location',
      'Username',
    ];
    for (const g of activeGrades) {
      headers.push(`${g.code} Stock (kg)`);
      headers.push(`${g.code} Price (${draftCurrency}/kg)`);
      headers.push(`${g.code} Value (${draftCurrency})`);
    }
    headers.push('Total Stock (kg)', 'Total Stock (MT)', `Total Value (${draftCurrency})`, 'Last Updated');

    const rows = filteredFactories.map((f) => {
      const fMap = invLookup.get(f.id);
      let rowKg = 0;
      let rowVal = 0;
      const gradeCols: string[] = [];
      for (const g of activeGrades) {
        const q = fMap?.get(g.id)?.quantityKg ?? 0;
        const p = effectiveUnitPrice(f.id, g.id);
        const v = q * p;
        rowKg += q;
        rowVal += v;
        gradeCols.push(String(q), p.toFixed(2), v.toFixed(2));
      }
      return [
        f.code,
        getLocalizedFactoryName(f, lang),
        f.region,
        f.location,
        f.username,
        ...gradeCols,
        String(rowKg),
        (rowKg / 1000).toFixed(2),
        rowVal.toFixed(2),
        getFactoryLastUpdated(f.id) || '',
      ];
    });

    const summaryGradeCols: string[] = [];
    for (const g of activeGrades) {
      const gKg = filteredTotals.gradeTotalsKg.get(g.id) ?? 0;
      const gVal = filteredTotals.gradeTotalsValue.get(g.id) ?? 0;
      const avgP = gKg > 0 ? gVal / gKg : 0;
      summaryGradeCols.push(String(gKg), avgP.toFixed(2), gVal.toFixed(2));
    }
    rows.push([
      'TOTAL',
      t.rowTotalWeight,
      '',
      '',
      '',
      ...summaryGradeCols,
      String(filteredTotals.totalKg),
      (filteredTotals.totalKg / 1000).toFixed(2),
      filteredTotals.totalValue.toFixed(2),
      '',
    ]);

    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `durian_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (!data) return;

    const s1Headers: (string | number)[] = [
      t.factoryCode,
      t.colFactory,
      t.factoryRegion,
      t.factoryLocation,
      t.factoryUsername,
    ];
    for (const g of activeGrades) {
      s1Headers.push(`${g.code} (kg)`);
      s1Headers.push(`${g.code} ${t.pricePerKg} (${draftCurrency})`);
      s1Headers.push(`${g.code} ${t.colEstValue} (${draftCurrency})`);
    }
    s1Headers.push(`${t.colTotalWeight} (kg)`, `${t.colTotalWeight} (${t.unitTon})`, `${t.colEstValue} (${draftCurrency})`, t.colUpdatedAt);

    const s1Rows: (string | number)[][] = [s1Headers];
    for (const f of filteredFactories) {
      const fMap = invLookup.get(f.id);
      let rowKg = 0;
      let rowVal = 0;
      const row: (string | number)[] = [
        f.code,
        getLocalizedFactoryName(f, lang),
        f.region,
        f.location,
        f.username,
      ];
      for (const g of activeGrades) {
        const q = fMap?.get(g.id)?.quantityKg ?? 0;
        const p = effectiveUnitPrice(f.id, g.id);
        const v = Math.round(q * p * 100) / 100;
        rowKg += q;
        rowVal += v;
        row.push(q, p, v);
      }
      row.push(
        rowKg,
        Math.round((rowKg / 1000) * 100) / 100,
        Math.round(rowVal * 100) / 100,
        getFactoryLastUpdated(f.id) || ''
      );
      s1Rows.push(row);
    }

    const s1TotalRow: (string | number)[] = ['TOTAL', t.rowTotalWeight, '', '', ''];
    for (const g of activeGrades) {
      const gKg = filteredTotals.gradeTotalsKg.get(g.id) ?? 0;
      const gVal = filteredTotals.gradeTotalsValue.get(g.id) ?? 0;
      const avgP = gKg > 0 ? Math.round((gVal / gKg) * 100) / 100 : 0;
      s1TotalRow.push(gKg, avgP, Math.round(gVal * 100) / 100);
    }
    s1TotalRow.push(
      filteredTotals.totalKg,
      Math.round((filteredTotals.totalKg / 1000) * 100) / 100,
      Math.round(filteredTotals.totalValue * 100) / 100,
      ''
    );
    s1Rows.push(s1TotalRow);

    const s2Headers: (string | number)[] = [
      t.factoryCode,
      t.colFactory,
      t.factoryRegion,
      t.currencyLabel,
      ...activeGrades.map((g) => `${g.code} - ${getLocalizedGradeName(g, lang)} (${draftCurrency}/kg)`),
    ];
    const s2Rows: (string | number)[][] = [s2Headers];
    for (const f of filteredFactories) {
      s2Rows.push([
        f.code,
        getLocalizedFactoryName(f, lang),
        f.region,
        draftCurrency,
        ...activeGrades.map((g) => effectiveUnitPrice(f.id, g.id)),
      ]);
    }

    const s3Rows: (string | number)[][] = [
      [
        t.gradeCode,
        t.colGrade,
        `${t.colTotalWeight} (kg)`,
        `${t.colTotalWeight} (${t.unitTon})`,
        `${t.weightedAvgPrice} (${draftCurrency})`,
        `${t.colEstValue} (${draftCurrency})`,
      ],
    ];
    for (const g of activeGrades) {
      const gKg = filteredTotals.gradeTotalsKg.get(g.id) ?? 0;
      const gVal = filteredTotals.gradeTotalsValue.get(g.id) ?? 0;
      const avgP = gKg > 0 ? Math.round((gVal / gKg) * 100) / 100 : 0;
      s3Rows.push([
        g.code,
        getLocalizedGradeName(g, lang),
        gKg,
        Math.round((gKg / 1000) * 100) / 100,
        avgP,
        Math.round(gVal * 100) / 100,
      ]);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1Rows), 'Inventory_Valuation');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2Rows), 'Factory_Unit_Prices');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3Rows), 'Grade_Summary');

    XLSX.writeFile(wb, `durian_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const openInspectDrawer = (factory: Factory) => {
    setInspectFactory(factory);
    const fMap = invLookup.get(factory.id);
    const qMap: Record<string, string> = {};
    const pMap: Record<string, string> = {};
    const nMap: Record<string, string> = {};
    for (const g of activeGrades) {
      const entry = fMap?.get(g.id);
      qMap[g.id] = entry ? String(entry.quantityKg) : '0';
      pMap[g.id] = String(effectiveUnitPrice(factory.id, g.id));
      nMap[g.id] = entry ? entry.note : '';
    }
    setAdjustQuantities(qMap);
    setAdjustPrices(pMap);
    setAdjustNotes(nMap);
    setAdjustGeneralNote('');
  };

  const handleSaveInspectAdjust = async () => {
    if (!inspectFactory || !data) return;
    setError('');
    setSavingAdjust(true);
    try {
      const items = activeGrades.map((g) => {
        const parsed = Number(adjustQuantities[g.id] || 0);
        return {
          gradeId: g.id,
          quantityKg: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
          note: adjustNotes[g.id] || '',
        };
      });
      const priceUpdates = activeGrades.map((g) => {
        const parsed = Number(adjustPrices[g.id] || 0);
        return {
          factoryId: inspectFactory.id,
          gradeId: g.id,
          unitPrice: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
        };
      });

      await api.adminUpdateFactoryInventory(inspectFactory, data.grades, items, adjustGeneralNote);
      await api.updateFactoryPrices(draftCurrency, priceUpdates, {
        factories: data.factories,
        grades: data.grades,
        previousPrices: data.factoryPrices,
        previousCurrency: data.currency,
      });
      setInspectFactory(null);
      await loadOverview();
      showNotice(t.inventorySaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSavingAdjust(false);
    }
  };

  const openCreateFactoryModal = () => {
    setEditingFactory(null);
    setFCode('');
    setFNameZh('');
    setFNameEn('');
    setFNameVi('');
    setFRegion('VN');
    setFLocation('');
    setFUsername('');
    setFPassword('');
    setFActive(true);
    setFactoryModalOpen(true);
  };

  const openEditFactoryModal = (f: Factory) => {
    setEditingFactory(f);
    setFCode(f.code);
    setFNameZh(f.nameZh);
    setFNameEn(f.nameEn);
    setFNameVi(f.nameVi);
    setFRegion(f.region);
    setFLocation(f.location);
    setFUsername(f.username);
    setFPassword('');
    setFActive(f.isActive);
    setFactoryModalOpen(true);
  };

  const handleSaveFactoryModal = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSavingFactory(true);
    try {
      if (editingFactory) {
        await api.updateFactory(editingFactory, {
          nameZh: fNameZh,
          nameEn: fNameEn,
          nameVi: fNameVi,
          region: fRegion,
          location: fLocation,
          username: fUsername,
          password: fPassword.trim(),
          isActive: fActive,
        });
      } else {
        await api.createFactory({
          code: fCode,
          nameZh: fNameZh,
          nameEn: fNameEn,
          nameVi: fNameVi,
          region: fRegion,
          location: fLocation,
          username: fUsername,
          password: fPassword.trim(),
        });
      }
      setFactoryModalOpen(false);
      await loadOverview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.errorGeneric;
      if (msg.includes('operation-not-allowed')) {
        setError(t.emailProviderDisabledHint);
      } else if (msg.includes('email-already-in-use')) {
        setError(t.factoryEmailExistsHint);
      } else {
        setError(msg);
      }
    } finally {
      setSavingFactory(false);
    }
  };

  const handleChangeAdminPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newAdminPwd.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    if (newAdminPwd !== confirmAdminPwd) {
      setError(t.passwordMismatch);
      return;
    }
    setSavingAdminPwd(true);
    try {
      await api.changeMainPassword(newAdminPwd);
      setAdminPwdModalOpen(false);
      setNewAdminPwd('');
      setConfirmAdminPwd('');
      showNotice(t.passwordUpdated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.errorGeneric;
      if (msg.includes('requires-recent-login')) {
        setError(t.requiresRecentLoginHint);
      } else {
        setError(msg);
      }
    } finally {
      setSavingAdminPwd(false);
    }
  };

  const handleDeleteFactory = async (f: Factory) => {
    setError('');
    try {
      await api.deleteFactory(f.id);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    }
  };

  const openCreateGradeModal = () => {
    setEditingGrade(null);
    setGCode('');
    setGNameZh('');
    setGNameEn('');
    setGNameVi('');
    setGSpecZh('');
    setGSpecEn('');
    setGSpecVi('');
    setGActive(true);
    setGradeModalOpen(true);
  };

  const openEditGradeModal = (g: Grade) => {
    setEditingGrade(g);
    setGCode(g.code);
    setGNameZh(g.nameZh);
    setGNameEn(g.nameEn);
    setGNameVi(g.nameVi);
    setGSpecZh(g.specZh);
    setGSpecEn(g.specEn);
    setGSpecVi(g.specVi);
    setGActive(g.isActive);
    setGradeModalOpen(true);
  };

  const handleSaveGradeModal = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSavingGrade(true);
    try {
      if (editingGrade) {
        await api.updateGrade(editingGrade, {
          nameZh: gNameZh,
          nameEn: gNameEn,
          nameVi: gNameVi,
          specZh: gSpecZh,
          specEn: gSpecEn,
          specVi: gSpecVi,
          isActive: gActive,
        });
      } else {
        const nextOrder = (data?.grades.reduce((m, g) => Math.max(m, g.sortOrder), 0) ?? 0) + 1;
        await api.createGrade({
          code: gCode,
          nameZh: gNameZh,
          nameEn: gNameEn,
          nameVi: gNameVi,
          specZh: gSpecZh,
          specEn: gSpecEn,
          specVi: gSpecVi,
          sortOrder: nextOrder,
        });
      }
      setGradeModalOpen(false);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSavingGrade(false);
    }
  };

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'overview', label: t.navOverview, icon: LayoutGrid },
    { id: 'pricing', label: t.navPricing, icon: BadgeDollarSign },
    { id: 'factories', label: t.navFactories, icon: FactoryIcon },
    { id: 'grades', label: t.navGrades, icon: Layers },
    { id: 'activity', label: t.navActivity, icon: History },
  ];

  const currentTabLabel = navItems.find((n) => n.id === tab)?.label || '';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              {t.brandName}
            </span>
            <span className="text-xs font-mono text-emerald-700">HQ</span>
          </div>

          <div className="px-5 py-3 border-b border-slate-200 text-xs text-slate-500 font-mono truncate">
            @{adminUsername}
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2.5">
          <div className="flex justify-center">
            <LanguageSwitcher lang={lang} onChange={onLangChange} />
          </div>
          <button
            type="button"
            onClick={() => {
              setNewAdminPwd('');
              setConfirmAdminPwd('');
              setAdminPwdModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t.changeAdminPassBtn}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {t.brandName} / {currentTabLabel}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="lg:hidden">
              <LanguageSwitcher lang={lang} onChange={onLangChange} />
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.refresh}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.exportCsv}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{t.exportExcel}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Mobile/Tablet Tab Strip */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                tab === item.id ? 'bg-emerald-700 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Viewport Body */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-6">
          {error && (
            <div className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-800 cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {notice && (
            <div className="p-3.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
              </div>
              <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          ) : data && tab === 'overview' ? (
            <>
              {/* 4-column KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.kpiTotalStock}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatWeightTons(networkStats.totalKg)} <span className="text-sm font-normal text-slate-500">{t.unitTon}</span>
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
                    {formatWeightKg(networkStats.totalKg)} kg
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.kpiTotalValue}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatCurrency(networkStats.totalValue, draftCurrency)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {draftCurrency}
                    {networkStats.hasMissingPrices ? ` · ${t.priceMissingWarning.slice(0, 26)}...` : ''}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.kpiFactories}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {networkStats.activeFactories}{' '}
                    <span className="text-sm font-normal text-slate-400">
                      / {networkStats.passwordReadyFactories} {t.passwordSet}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {data.factories.length} total
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.kpiActiveGrades}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {activeGrades.length}
                  </div>
                  <div className="mt-1 text-xs font-mono text-slate-500 truncate">
                    {activeGrades.map((g) => g.code).join(' · ')}
                  </div>
                </div>
              </div>

              {/* Per-Factory Pricing Action Callout */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{t.pricingQuickBannerTitle}</h2>
                  <p className="text-xs text-slate-500 mt-1">{t.pricingQuickBannerDesc}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg">
                    {(['CNY', 'USD', 'VND'] as Currency[]).map((curr) => (
                      <button
                        key={curr}
                        type="button"
                        onClick={() => setDraftCurrency(curr)}
                        className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md cursor-pointer transition-colors ${
                          draftCurrency === curr
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {curr} {currencySymbol(curr)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('pricing')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BadgeDollarSign className="w-4 h-4" />
                    <span>{t.openPricingMatrixBtn}</span>
                  </button>
                </div>
              </div>

              {/* Cross-Factory Inventory Matrix */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <h2 className="text-base font-bold text-slate-900">{t.matrixTitle}</h2>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.searchPlaceholder}
                        className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 w-56 focus:outline-none focus:border-emerald-700"
                      />
                    </div>

                    <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg">
                      {[
                        { key: 'ALL', label: t.regionAll },
                        { key: 'VN', label: t.regionVN },
                        { key: 'TH', label: t.regionTH },
                        { key: 'MY', label: t.regionMY },
                      ].map((reg) => (
                        <button
                          key={reg.key}
                          type="button"
                          onClick={() => setRegionFilter(reg.key)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                            regionFilter === reg.key
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {reg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-5 whitespace-nowrap">{t.colFactory}</th>
                        {activeGrades.map((g) => (
                          <th key={g.id} className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="font-mono text-slate-900">{g.code}</div>
                            <div className="text-[11px] font-normal text-slate-500">kg</div>
                          </th>
                        ))}
                        <th className="py-3 px-4 text-right whitespace-nowrap">{t.colTotalWeight}</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">{t.colEstValue}</th>
                        <th className="py-3 px-4 whitespace-nowrap">{t.colUpdatedAt}</th>
                        <th className="py-3 px-5 text-right whitespace-nowrap">{t.colActions}</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredFactories.length === 0 ? (
                        <tr>
                          <td colSpan={activeGrades.length + 5} className="py-10 text-center text-slate-500">
                            {t.noData}
                          </td>
                        </tr>
                      ) : (
                        filteredFactories.map((factory) => {
                          const fMap = invLookup.get(factory.id);
                          let rowKg = 0;
                          let rowVal = 0;
                          for (const g of activeGrades) {
                            const qty = fMap?.get(g.id)?.quantityKg ?? 0;
                            rowKg += qty;
                            rowVal += qty * effectiveUnitPrice(factory.id, g.id);
                          }
                          const updatedAt = getFactoryLastUpdated(factory.id);

                          return (
                            <tr
                              key={factory.id}
                              onClick={() => openInspectDrawer(factory)}
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-slate-700">{factory.code}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-semibold text-slate-900">
                                    {getLocalizedFactoryName(factory, lang)}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {factory.region}
                                  {factory.location ? ` · ${factory.location}` : ''}
                                  <span className="mx-1.5">·</span>
                                  <span className="font-mono">@{factory.username}</span>
                                  {!factory.isActive && (
                                    <span className="ml-2 text-red-600 font-medium">· {t.statusDisabled}</span>
                                  )}
                                </div>
                              </td>

                              {activeGrades.map((g) => {
                                const qty = fMap?.get(g.id)?.quantityKg ?? 0;
                                const unitP = effectiveUnitPrice(factory.id, g.id);
                                return (
                                  <td
                                    key={g.id}
                                    className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                                  >
                                    <div className={qty > 0 ? 'text-slate-900' : 'text-slate-300'}>
                                      {formatWeightKg(qty)}
                                    </div>
                                    {unitP > 0 && (
                                      <div className="text-[10px] text-slate-400">
                                        {currencySymbol(draftCurrency)}{unitP}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                <div className="font-semibold text-slate-900">{formatWeightKg(rowKg)} kg</div>
                                <div className="text-[11px] text-slate-500">{formatWeightTons(rowKg)} t</div>
                              </td>

                              <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-800 whitespace-nowrap">
                                {formatCurrency(rowVal, draftCurrency)}
                              </td>

                              <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                {formatDate(updatedAt)}
                              </td>

                              <td className="py-3 px-5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInspectDrawer(factory);
                                  }}
                                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                >
                                  {t.inspectAdjust}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {filteredFactories.length > 0 && (
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs">
                        <tr>
                          <td className="py-3 px-5 font-semibold text-slate-900">{t.rowTotalWeight}</td>
                          {activeGrades.map((g) => (
                            <td key={g.id} className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {formatWeightKg(filteredTotals.gradeTotalsKg.get(g.id) ?? 0)}
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                            {formatWeightKg(filteredTotals.totalKg)} kg
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-800" rowSpan={2}>
                            {formatCurrency(filteredTotals.totalValue, draftCurrency)}
                          </td>
                          <td colSpan={2} rowSpan={2} />
                        </tr>

                        <tr className="border-t border-slate-200 text-slate-600">
                          <td className="py-2.5 px-5 font-medium">{t.rowTotalTons}</td>
                          {activeGrades.map((g) => (
                            <td key={g.id} className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {formatWeightTons(filteredTotals.gradeTotalsKg.get(g.id) ?? 0)} t
                            </td>
                          ))}
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                            {formatWeightTons(filteredTotals.totalKg)} t
                          </td>
                        </tr>

                        <tr className="border-t border-slate-200 text-slate-600">
                          <td className="py-2.5 px-5 font-medium">{t.weightedAvgPrice}</td>
                          {activeGrades.map((g) => {
                            const gKg = filteredTotals.gradeTotalsKg.get(g.id) ?? 0;
                            const gVal = filteredTotals.gradeTotalsValue.get(g.id) ?? 0;
                            const avg = gKg > 0 ? gVal / gKg : 0;
                            return (
                              <td key={g.id} className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {formatCurrency(avg, draftCurrency)}
                              </td>
                            );
                          })}
                          <td colSpan={4} />
                        </tr>

                        <tr className="border-t border-slate-200 bg-emerald-50/40 font-semibold text-slate-900">
                          <td className="py-3 px-5">{t.rowGradeValue}</td>
                          {activeGrades.map((g) => {
                            const val = filteredTotals.gradeTotalsValue.get(g.id) ?? 0;
                            return (
                              <td key={g.id} className="py-3 px-3 text-right font-mono tabular-nums text-emerald-900">
                                {formatCurrency(val, draftCurrency)}
                              </td>
                            );
                          })}
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {formatWeightTons(filteredTotals.totalKg)} t
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-800">
                            {formatCurrency(filteredTotals.totalValue, draftCurrency)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-bold text-slate-900">{t.recentActivityTitle}</h2>
                  <button
                    type="button"
                    onClick={() => setTab('activity')}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {t.viewAllActivity}
                  </button>
                </div>
                {data.activityLogs.length === 0 ? (
                  <div className="px-6 py-8 text-center text-xs text-slate-500">
                    {t.activityEmpty}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2.5 px-5">{t.colTime}</th>
                          <th className="py-2.5 px-4">{t.colEventType}</th>
                          <th className="py-2.5 px-4">{t.colFactory}</th>
                          <th className="py-2.5 px-4">{t.colActor}</th>
                          <th className="py-2.5 px-5">{t.colDetails}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.activityLogs.slice(0, 8).map((log) => {
                          const evt = getEventStyle(log.eventType);
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-5 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                {formatDate(log.createdAt)}
                              </td>
                              <td className={`py-2.5 px-4 whitespace-nowrap ${evt.className}`}>
                                {evt.label}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                                <span className="font-mono text-slate-500 mr-1.5">{log.factoryCode}</span>
                                {getActivityFactoryName(log)}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                                @{log.actorUsername} ({log.actorRole === 'admin' ? t.roleAdmin : t.roleFactory})
                              </td>
                              <td className="py-2.5 px-5 font-mono tabular-nums text-slate-600">
                                {log.eventType === 'inventory_update' && (
                                  <span className="font-semibold text-slate-900 mr-2">
                                    {formatWeightKg(log.totalKg)} kg ·
                                  </span>
                                )}
                                {formatActivityDetail(log)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : data && tab === 'pricing' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-bold text-slate-900">{t.pricingBarTitle}</h1>
                  <p className="text-xs text-slate-500 mt-1">{t.pricingBarHint}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg">
                    {(['CNY', 'USD', 'VND'] as Currency[]).map((curr) => (
                      <button
                        key={curr}
                        type="button"
                        onClick={() => setDraftCurrency(curr)}
                        className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md cursor-pointer transition-colors ${
                          draftCurrency === curr
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {curr} {currencySymbol(curr)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveAllFactoryPrices()}
                    disabled={savingPrices}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {savingPrices ? t.saving : t.savePrices}
                  </button>
                </div>
              </div>

              <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.searchPlaceholder}
                      className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 w-52 focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                  <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-lg">
                    {[
                      { key: 'ALL', label: t.regionAll },
                      { key: 'VN', label: t.regionVN },
                      { key: 'TH', label: t.regionTH },
                      { key: 'MY', label: t.regionMY },
                    ].map((reg) => (
                      <button
                        key={reg.key}
                        type="button"
                        onClick={() => setRegionFilter(reg.key)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                          regionFilter === reg.key
                            ? 'bg-emerald-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {reg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">{t.batchFillHint}</span>
                  <select
                    value={batchGradeId}
                    onChange={(e) => setBatchGradeId(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900"
                  >
                    {activeGrades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={batchPriceInput}
                    onChange={(e) => setBatchPriceInput(e.target.value)}
                    placeholder={`${currencySymbol(draftCurrency)}/kg`}
                    className="w-24 px-2.5 py-1.5 text-right font-mono bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleApplyBatchPrice}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {t.applyToFiltered}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                      <th className="py-3 px-5 whitespace-nowrap">{t.colFactory}</th>
                      {activeGrades.map((g) => (
                        <th key={g.id} className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-mono text-slate-900">{g.code} ({currencySymbol(draftCurrency)}/kg)</div>
                          <div className="text-[11px] font-normal text-slate-500 truncate max-w-[120px] ml-auto">
                            {getLocalizedGradeName(g, lang)}
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right whitespace-nowrap">{t.colTotalWeight}</th>
                      <th className="py-3 px-5 text-right whitespace-nowrap">{t.colEstValue}</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {filteredFactories.map((factory) => {
                      const fMap = invLookup.get(factory.id);
                      let rowKg = 0;
                      let rowVal = 0;
                      for (const g of activeGrades) {
                        const qty = fMap?.get(g.id)?.quantityKg ?? 0;
                        rowKg += qty;
                        rowVal += qty * effectiveUnitPrice(factory.id, g.id);
                      }

                      return (
                        <tr key={factory.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono text-slate-600 mr-1.5">{factory.code}</span>
                              {getLocalizedFactoryName(factory, lang)}
                            </div>
                            <div className="text-[11px] text-slate-500">{factory.region}</div>
                          </td>

                          {activeGrades.map((g) => {
                            const key = priceKey(factory.id, g.id);
                            const qty = fMap?.get(g.id)?.quantityKg ?? 0;
                            return (
                              <td key={g.id} className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={draftFactoryPrices[key] ?? ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    setDraftFactoryPrices((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  aria-label={`${factory.code} ${g.code} unit price`}
                                  className="w-24 px-2.5 py-1.5 text-right font-mono tabular-nums text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700"
                                />
                                <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-400">
                                  {formatWeightKg(qty)} kg
                                </div>
                              </td>
                            );
                          })}

                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatWeightKg(rowKg)} kg
                          </td>

                          <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-emerald-800 whitespace-nowrap">
                            {formatCurrency(rowVal, draftCurrency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
                    <tr>
                      <td className="py-3.5 px-5 text-slate-900">{t.kpiTotalValue}</td>
                      {activeGrades.map((g) => (
                        <td key={g.id} className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatCurrency(filteredTotals.gradeTotalsValue.get(g.id) ?? 0, draftCurrency)}
                        </td>
                      ))}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                        {formatWeightTons(filteredTotals.totalKg)} {t.unitTon}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-emerald-800">
                        {formatCurrency(filteredTotals.totalValue, draftCurrency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : data && tab === 'factories' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-bold text-slate-900">{t.factoriesTitle}</h1>
                  <p className="text-xs text-slate-500 mt-1">{t.factoriesDesc}</p>
                </div>
                <button
                  type="button"
                  onClick={openCreateFactoryModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addFactory}</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <th className="py-3 px-5">{t.factoryCode}</th>
                      <th className="py-3 px-4">{t.colFactory}</th>
                      <th className="py-3 px-4">{t.factoryUsername}</th>
                      <th className="py-3 px-4">{t.colStatus}</th>
                      <th className="py-3 px-4">{t.lastLoginAt}</th>
                      <th className="py-3 px-5 text-right">{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.factories.map((f) => {
                      const lastLogin = lastLoginByFactory.get(f.id) || null;
                      return (
                      <tr key={f.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {f.code}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{getLocalizedFactoryName(f, lang)}</div>
                          <div className="mt-0.5 text-slate-500">
                            {f.region}
                            {f.location ? ` · ${f.location}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-800 whitespace-nowrap">
                          @{f.username}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={f.isActive ? 'text-emerald-700 font-medium' : 'text-red-600 font-medium'}>
                              {f.isActive ? t.statusActive : t.statusDisabled}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className={f.hasPassword ? 'text-slate-600' : 'text-amber-700 font-medium'}>
                              {f.hasPassword ? t.passwordSet : t.passwordUnset}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {lastLogin ? formatDate(lastLogin) : t.neverLoggedIn}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => openEditFactoryModal(f)}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>{f.hasPassword ? t.resetPasswordBtn : t.setPasswordBtn}</span>
                            </button>

                            {pendingDeleteFactoryId === f.id ? (
                              <span className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingDeleteFactoryId(null);
                                    void handleDeleteFactory(f);
                                  }}
                                  className="text-red-700 font-semibold hover:underline cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteFactoryId(null)}
                                  className="text-slate-500 hover:underline cursor-pointer"
                                >
                                  {t.cancel}
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteFactoryId(f.id)}
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-red-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t.deleteFactoryBtn}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : data && tab === 'grades' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-bold text-slate-900">{t.gradesTitle}</h1>
                  <p className="text-xs text-slate-500 mt-1">{t.gradesDesc}</p>
                </div>
                <button
                  type="button"
                  onClick={openCreateGradeModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addGrade}</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <th className="py-3 px-5">{t.gradeCode}</th>
                      <th className="py-3 px-4">{t.colGrade}</th>
                      <th className="py-3 px-4">{t.colStatus}</th>
                      <th className="py-3 px-5 text-right">{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.grades.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-5 font-mono font-semibold text-emerald-700 whitespace-nowrap">
                          {g.code}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{g.nameZh}</div>
                          <div className="text-slate-600 mt-0.5">
                            {g.nameEn} · {g.nameVi}
                          </div>
                          <div className="text-slate-400 mt-0.5">{getLocalizedGradeSpec(g, lang)}</div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={g.isActive ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                            {g.isActive ? t.statusActive : t.statusDisabled}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditGradeModal(g)}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>{t.editGrade}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : data && tab === 'activity' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-bold text-slate-900">{t.activityTitle}</h1>
                  <p className="text-xs text-slate-500 mt-1">{t.activityDesc}</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportActivityCsv}
                  disabled={filteredActivityLogs.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.exportActivityCsv}</span>
                </button>
              </div>

              {/* Compact Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                <div className="px-6 py-3.5">
                  <div className="text-[11px] text-slate-500">{t.totalEventsCount}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                    {activityCounts.all}
                  </div>
                </div>
                <div className="px-6 py-3.5">
                  <div className="text-[11px] font-medium text-emerald-700">{t.eventInventoryUpdate}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                    {activityCounts.inventory_update}
                  </div>
                </div>
                <div className="px-6 py-3.5">
                  <div className="text-[11px] font-medium text-sky-700">{t.eventLogin}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                    {activityCounts.login}
                  </div>
                </div>
                <div className="px-6 py-3.5">
                  <div className="text-[11px] font-medium text-amber-700">{t.eventPriceChange}</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                    {activityCounts.price_change}
                  </div>
                </div>
              </div>

              {/* Filter Toolbar */}
              <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                      placeholder={t.activitySearchPlaceholder}
                      className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 w-64 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <select
                    value={activityFactoryFilter}
                    onChange={(e) => setActivityFactoryFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-700"
                  >
                    <option value="ALL">{t.filterAllFactories}</option>
                    {data.factories.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} · {getLocalizedFactoryName(f, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-lg self-start lg:self-auto">
                  {(
                    [
                      { key: 'ALL', label: t.filterAllEvents },
                      { key: 'inventory_update', label: t.eventInventoryUpdate },
                      { key: 'login', label: t.eventLogin },
                      { key: 'price_change', label: t.eventPriceChange },
                    ] as const
                  ).map((evt) => (
                    <button
                      key={evt.key}
                      type="button"
                      onClick={() => setActivityTypeFilter(evt.key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                        activityTypeFilter === evt.key
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {evt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <th className="py-3 px-5 whitespace-nowrap">{t.colTime}</th>
                      <th className="py-3 px-4 whitespace-nowrap">{t.colEventType}</th>
                      <th className="py-3 px-4 whitespace-nowrap">{t.colFactory}</th>
                      <th className="py-3 px-4 whitespace-nowrap">{t.colActor}</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">{t.colTotalWeight}</th>
                      <th className="py-3 px-5">{t.colDetails}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredActivityLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          {t.activityEmpty}
                        </td>
                      </tr>
                    ) : (
                      filteredActivityLogs.map((log) => {
                        const evt = getEventStyle(log.eventType);
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-5 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              {formatDate(log.createdAt)}
                            </td>
                            <td className={`py-3 px-4 whitespace-nowrap ${evt.className}`}>
                              {evt.label}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-mono font-semibold text-slate-700 mr-1.5">
                                {log.factoryCode}
                              </span>
                              <span className="font-medium text-slate-900">
                                {getActivityFactoryName(log)}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                              @{log.actorUsername}{' '}
                              <span className="text-slate-400">
                                ({log.actorRole === 'admin' ? t.roleAdmin : t.roleFactory})
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                              {log.eventType === 'inventory_update'
                                ? `${formatWeightKg(log.totalKg)} kg`
                                : '—'}
                            </td>
                            <td className="py-3 px-5 font-mono tabular-nums text-slate-600">
                              {formatActivityDetail(log)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Inspect / Adjust Factory Inventory + Per-Factory Unit Prices Modal */}
      {inspectFactory && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{t.drawerTitle}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  <span className="font-mono text-emerald-700">{inspectFactory.code}</span> ·{' '}
                  {getLocalizedFactoryName(inspectFactory, lang)} · @{inspectFactory.username}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectFactory(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="hidden sm:grid sm:grid-cols-12 gap-3 text-[11px] font-medium text-slate-500 pb-2 border-b border-slate-200">
                <div className="sm:col-span-4">{t.colGrade}</div>
                <div className="sm:col-span-2 text-right">{t.colCurrentQty}</div>
                <div className="sm:col-span-3 text-right">{t.pricePerKg} ({draftCurrency})</div>
                <div className="sm:col-span-3">{t.colGradeNote}</div>
              </div>

              {activeGrades.map((g) => (
                <div
                  key={g.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pb-3 border-b border-slate-100 last:border-0"
                >
                  <div className="sm:col-span-4">
                    <div className="text-xs font-semibold text-slate-900">
                      <span className="font-mono text-emerald-700 mr-1.5">{g.code}</span>
                      {getLocalizedGradeName(g, lang)}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={adjustQuantities[g.id] ?? '0'}
                      onChange={(e) =>
                        setAdjustQuantities((prev) => ({ ...prev, [g.id]: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-right font-mono tabular-nums text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                      {currencySymbol(draftCurrency)}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={adjustPrices[g.id] ?? '0'}
                      onChange={(e) =>
                        setAdjustPrices((prev) => ({ ...prev, [g.id]: e.target.value }))
                      }
                      className="w-full pl-6 pr-2.5 py-1.5 text-right font-mono tabular-nums text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      value={adjustNotes[g.id] ?? ''}
                      onChange={(e) =>
                        setAdjustNotes((prev) => ({ ...prev, [g.id]: e.target.value }))
                      }
                      placeholder={t.colGradeNote}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.generalNoteLabel}
                </label>
                <input
                  type="text"
                  value={adjustGeneralNote}
                  onChange={(e) => setAdjustGeneralNote(e.target.value)}
                  placeholder={t.drawerNotePlaceholder}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInspectFactory(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveInspectAdjust()}
                disabled={savingAdjust}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {savingAdjust ? t.saving : t.drawerSave}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Factory Modal */}
      {factoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFactoryModal}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingFactory ? t.editFactory : t.addFactory}
              </h3>
              <button
                type="button"
                onClick={() => setFactoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.factoryCode}</label>
                  <input
                    type="text"
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    disabled={Boolean(editingFactory)}
                    placeholder="VN-TG-03"
                    required
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.factoryRegion}</label>
                  <select
                    value={fRegion}
                    onChange={(e) => setFRegion(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="VN">{t.regionVN}</option>
                    <option value="TH">{t.regionTH}</option>
                    <option value="MY">{t.regionMY}</option>
                    <option value="OTHER">{t.regionOTHER}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.factoryNameZh}</label>
                <input
                  type="text"
                  value={fNameZh}
                  onChange={(e) => setFNameZh(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.factoryNameEn}</label>
                  <input
                    type="text"
                    value={fNameEn}
                    onChange={(e) => setFNameEn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.factoryNameVi}</label>
                  <input
                    type="text"
                    value={fNameVi}
                    onChange={(e) => setFNameVi(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.factoryLocation}</label>
                <input
                  type="text"
                  value={fLocation}
                  onChange={(e) => setFLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">{t.factoryUsername}</label>
                    <input
                      type="text"
                      value={fUsername}
                      onChange={(e) => setFUsername(e.target.value)}
                      required
                      placeholder="vn_tg_03"
                      className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">{t.factoryPassword}</label>
                    <input
                      type="password"
                      value={fPassword}
                      onChange={(e) => setFPassword(e.target.value)}
                      minLength={fPassword.length > 0 ? 6 : undefined}
                      placeholder={
                        editingFactory && editingFactory.ownerUid
                          ? t.factoryPasswordOptionalHint
                          : 'Min 6 chars'
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {editingFactory && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fActive}
                    onChange={(e) => setFActive(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  <span className="text-slate-700">{t.factoryActiveLabel}</span>
                </label>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setFactoryModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingFactory}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {savingFactory ? t.saving : editingFactory ? t.save : t.create}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create / Edit Grade Modal */}
      {gradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveGradeModal}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingGrade ? t.editGrade : t.addGrade}
              </h3>
              <button
                type="button"
                onClick={() => setGradeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 max-h-[75vh] overflow-y-auto text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.gradeCode}</label>
                <input
                  type="text"
                  value={gCode}
                  onChange={(e) => setGCode(e.target.value)}
                  disabled={Boolean(editingGrade)}
                  required
                  placeholder="S1"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.gradeNameZh}</label>
                <input
                  type="text"
                  value={gNameZh}
                  onChange={(e) => setGNameZh(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.gradeNameEn}</label>
                <input
                  type="text"
                  value={gNameEn}
                  onChange={(e) => setGNameEn(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.gradeNameVi}</label>
                <input
                  type="text"
                  value={gNameVi}
                  onChange={(e) => setGNameVi(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.gradeSpecZh}</label>
                <input
                  type="text"
                  value={gSpecZh}
                  onChange={(e) => setGSpecZh(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.gradeSpecEn}</label>
                  <input
                    type="text"
                    value={gSpecEn}
                    onChange={(e) => setGSpecEn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t.gradeSpecVi}</label>
                  <input
                    type="text"
                    value={gSpecVi}
                    onChange={(e) => setGSpecVi(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {editingGrade && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gActive}
                    onChange={(e) => setGActive(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  <span className="text-slate-700">{t.gradeActiveLabel}</span>
                </label>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGradeModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingGrade}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {savingGrade ? t.saving : editingGrade ? t.save : t.create}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Main Password Modal */}
      {adminPwdModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleChangeAdminPassword}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{t.changeAdminPassTitle}</h3>
              <button
                type="button"
                onClick={() => setAdminPwdModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.newPasswordLabel}</label>
                <input
                  type="password"
                  value={newAdminPwd}
                  onChange={(e) => setNewAdminPwd(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">{t.confirmPasswordLabel}</label>
                <input
                  type="password"
                  value={confirmAdminPwd}
                  onChange={(e) => setConfirmAdminPwd(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAdminPwdModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingAdminPwd}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {savingAdminPwd ? t.saving : t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
