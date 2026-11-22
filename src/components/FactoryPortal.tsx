import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, History, LogOut, PackageCheck, RefreshCw } from 'lucide-react';
import { api } from '../api';
import {
  formatWeightKg,
  formatWeightTons,
  getLocalizedFactoryName,
  getLocalizedGradeName,
  getLocalizedGradeSpec,
  TRANSLATIONS,
} from '../i18n';
import type { Factory, FactoryWorkspaceData, Lang } from '../types';
import { LanguageSwitcher } from './LanguageSwitcher';

interface FactoryPortalProps {
  factory: Factory;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onLogout: () => void;
}

type FactoryTab = 'entry' | 'history';

export function FactoryPortal({ factory, lang, onLangChange, onLogout }: FactoryPortalProps) {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<FactoryTab>('entry');
  const [data, setData] = useState<FactoryWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [gradeNotes, setGradeNotes] = useState<Record<string, string>>({});
  const [generalNote, setGeneralNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState('');

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const ws = await api.getFactoryWorkspace(factory);
      setData(ws);
      const qMap: Record<string, string> = {};
      const nMap: Record<string, string> = {};
      for (const g of ws.grades) {
        const inv = ws.inventory.find((i) => i.gradeId === g.id);
        qMap[g.id] = inv ? String(inv.quantityKg) : '0';
        nMap[g.id] = inv ? inv.note : '';
      }
      setQuantities(qMap);
      setGradeNotes(nMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [factory.id]);

  const totalKg = useMemo(() => {
    if (!data) return 0;
    return data.grades.reduce((sum, g) => {
      const val = Number(quantities[g.id] || 0);
      return sum + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);
  }, [data, quantities]);

  const lastUpdatedAt = useMemo(() => {
    if (!data || data.inventory.length === 0) return null;
    const sorted = [...data.inventory].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sorted[0]?.updatedAt || null;
  }, [data]);

  const adjustQuantity = (gradeId: string, delta: number) => {
    setQuantities((prev) => {
      const current = Number(prev[gradeId] || 0);
      const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
      return { ...prev, [gradeId]: String(next) };
    });
  };

  const handleSave = async () => {
    if (!data) return;
    setError('');
    setSavedBanner('');
    setSaving(true);
    try {
      const items = data.grades.map((g) => {
        const parsed = Number(quantities[g.id] || 0);
        return {
          gradeId: g.id,
          quantityKg: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
          note: gradeNotes[g.id] || '',
        };
      });
      const res = await api.saveFactoryInventory(data.factory, data.grades, items, generalNote);
      setData((prev) =>
        prev
          ? {
              ...prev,
              inventory: res.inventory,
              logs: res.logs,
            }
          : prev
      );
      setGeneralNote('');
      setSavedBanner(t.inventorySaved);
      setTimeout(() => setSavedBanner(''), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return t.neverUpdated;
    try {
      return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : lang === 'vi' ? 'vi-VN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              {t.brandName}
            </span>
          </div>

          {data && (
            <div className="p-5 border-b border-slate-200">
              <div className="text-xs font-mono text-emerald-700">{data.factory.code}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {getLocalizedFactoryName(data.factory, lang)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {data.factory.region}
                {data.factory.location ? ` · ${data.factory.location}` : ''}
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono">@{data.factory.username}</div>
            </div>
          )}

          <nav className="p-3 space-y-1">
            <button
              type="button"
              onClick={() => setTab('entry')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                tab === 'entry'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.navFactoryEntry}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                tab === 'history'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.navFactoryHistory}</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex justify-center">
            <LanguageSwitcher lang={lang} onChange={onLangChange} />
          </div>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {data ? `${getLocalizedFactoryName(data.factory, lang)} / ${tab === 'entry' ? t.navFactoryEntry : t.navFactoryHistory}` : t.factoryPortalTitle}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="md:hidden">
              <LanguageSwitcher lang={lang} onChange={onLangChange} />
            </div>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t.refresh}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </header>

        {/* Mobile sub-nav */}
        <div className="md:hidden bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('entry')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'entry' ? 'bg-emerald-700 text-white' : 'text-slate-600 bg-slate-100'
            }`}
          >
            {t.navFactoryEntry}
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'history' ? 'bg-emerald-700 text-white' : 'text-slate-600 bg-slate-100'
            }`}
          >
            {t.navFactoryHistory}
          </button>
        </div>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {error && (
            <div className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {savedBanner && (
            <div className="p-3.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{savedBanner}</span>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
              <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : data && tab === 'entry' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.totalCurrentFactoryStock}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatWeightKg(totalKg)} <span className="text-sm font-normal text-slate-500">kg</span>
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
                    {formatWeightTons(totalKg)} {t.unitTon}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.kpiActiveGrades}</div>
                  <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {data.grades.length}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{data.factory.code}</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">{t.lastSavedAt}</div>
                  <div className="mt-2 text-base font-semibold font-mono tabular-nums text-slate-900">
                    {formatDate(lastUpdatedAt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">@{data.factory.username}</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h1 className="text-base font-bold text-slate-900">{t.factoryPortalTitle}</h1>
                  <p className="text-xs text-slate-500 mt-0.5">{t.factoryPortalDesc}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-6">{t.colGrade}</th>
                        <th className="py-3 px-4 text-right w-56">{t.colCurrentQty}</th>
                        <th className="py-3 px-4 text-right w-32">{t.colTonPreview}</th>
                        <th className="py-3 px-6">{t.colGradeNote}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {data.grades.map((grade) => {
                        const qtyNum = Number(quantities[grade.id] || 0);
                        const safeQty = Number.isFinite(qtyNum) && qtyNum >= 0 ? qtyNum : 0;
                        return (
                          <tr key={grade.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-baseline gap-2.5">
                                <span className="font-mono text-xs font-semibold text-emerald-700">
                                  {grade.code}
                                </span>
                                <span className="font-semibold text-slate-900">
                                  {getLocalizedGradeName(grade, lang)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {getLocalizedGradeSpec(grade, lang)}
                              </div>
                            </td>

                            <td className="py-4 px-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={quantities[grade.id] ?? '0'}
                                  onChange={(e) =>
                                    setQuantities((prev) => ({ ...prev, [grade.id]: e.target.value }))
                                  }
                                  className="w-32 px-3 py-2 text-right font-mono tabular-nums text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                                />
                                <button
                                  type="button"
                                  onClick={() => adjustQuantity(grade.id, 100)}
                                  className="px-2 py-2 text-xs font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer shrink-0"
                                  title="+100 kg"
                                >
                                  +100
                                </button>
                                <button
                                  type="button"
                                  onClick={() => adjustQuantity(grade.id, 1000)}
                                  className="px-2 py-2 text-xs font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer shrink-0"
                                  title="+1000 kg"
                                >
                                  +1t
                                </button>
                              </div>
                            </td>

                            <td className="py-4 px-4 text-right font-mono tabular-nums text-slate-600">
                              {formatWeightTons(safeQty)} t
                            </td>

                            <td className="py-4 px-6">
                              <input
                                type="text"
                                value={gradeNotes[grade.id] ?? ''}
                                onChange={(e) =>
                                  setGradeNotes((prev) => ({ ...prev, [grade.id]: e.target.value }))
                                }
                                placeholder={t.colGradeNote}
                                maxLength={160}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-emerald-700"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-5 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="flex-1 max-w-xl">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      {t.generalNoteLabel}
                    </label>
                    <input
                      type="text"
                      value={generalNote}
                      onChange={(e) => setGeneralNote(e.target.value)}
                      placeholder={t.generalNotePlaceholder}
                      maxLength={250}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{t.colTotalWeight}</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {formatWeightKg(totalKg)} kg
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>{saving ? t.saving : t.saveInventory}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : data && tab === 'history' ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">{t.historyTitle}</h2>
              </div>
              {data.logs.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">{t.historyEmpty}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                        <th className="py-3 px-6">{t.colTime}</th>
                        <th className="py-3 px-4">{t.colActor}</th>
                        <th className="py-3 px-4 text-right">{t.colTotalWeight}</th>
                        <th className="py-3 px-6">{t.colBreakdown}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {data.logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-6 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {log.actorUsername}
                            <span className="text-slate-400 ml-1.5">
                              ({log.actorRole === 'admin' ? t.roleAdmin : t.roleFactory})
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatWeightKg(log.totalKg)} kg
                          </td>
                          <td className="py-3 px-6 text-slate-600">
                            <div className="font-mono tabular-nums">
                              {log.snapshot.map((s) => `${s.code}: ${formatWeightKg(s.quantityKg)}`).join(' · ')}
                            </div>
                            {log.note && <div className="mt-1 text-slate-500">{log.note}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
