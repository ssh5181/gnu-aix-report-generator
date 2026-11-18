'use client';

import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Award,
  Sliders,
  UserCheck,
} from 'lucide-react';
import {
  AcademicField,
  DEFAULT_RUBRIC_WEIGHTS,
  FACULTY_DIAGNOSIS_QUESTIONS,
  FIELD_PRESETS,
  SAMPLE_WIZARD_INPUT,
  WizardFormInput,
} from '@/constants/axisPresets';
import { AiXCourseType, AiXReportData, CompetencyLevel } from '@/types/report';
import { generateAiXReportHwpx } from '@/lib/hwpx/hwpxGenerator';

const STEPS = [
  { id: 1, title: '기본 정보·유형', icon: BookOpen },
  { id: 2, title: '전공-AI 설계', icon: Layers },
  { id: 3, title: '진단·교원역량', icon: UserCheck },
  { id: 4, title: '15주·모듈설계', icon: Sliders },
  { id: 5, title: '다차원 평가', icon: ShieldCheck },
  { id: 6, title: '성과·개설계획', icon: Award },
];

const STORAGE_KEY = 'gnu_aix_verified_passcode';

export default function AiXReportGeneratorPage() {
  // 인증 상태 관리
  const [passcode, setPasscode] = useState<string>('');
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 위저드 및 보고서 상태 관리
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [input, setInput] = useState<WizardFormInput>(SAMPLE_WIZARD_INPUT);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<AiXReportData | null>(null);
  const [removeGuidePage, setRemoveGuidePage] = useState<boolean>(true);

  // 기존 세션 인증 확인
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setPasscode(saved);
      setIsUnlocked(true);
    }
  }, []);

const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsCheckingAuth(true);
    try {
      const trimmed = passcodeInput.trim();
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: trimmed }),
      });
      const rawBody = await res.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error(`서버 응답 지연 또는 오류 (HTTP ${res.status}): 잠시 후 다시 시도해 주세요.`);
      }
      if (!res.ok) {
        throw new Error(data.error || '입장 코드 확인에 실패했습니다.');
      }
      sessionStorage.setItem(STORAGE_KEY, trimmed);
      setPasscode(trimmed);
      setIsUnlocked(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : '인증 오류가 발생했습니다.');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLockOut = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setPasscode('');
    setPasscodeInput('');
    setIsUnlocked(false);
  };
  const preset = FIELD_PRESETS[input.academicField];
  const totalWeight = input.rubricWeights.reduce((a, b) => a + b, 0);
  const humanAccountabilityRatio = (input.rubricWeights[3] || 0) + (input.rubricWeights[4] || 0);

  const getAreaAvg = (areaIdx: number) => {
    const slice = input.facultyScores.slice((areaIdx - 1) * 4, areaIdx * 4);
    const avg = slice.reduce((a, b) => a + b, 0) / 4;
    const stage = avg < 2.5 ? 'Acquire(기초)' : avg < 4.0 ? 'Deepen(심화)' : 'Create(확장)';
    return { avg: avg.toFixed(1), stage };
  };

  const toggleCourseType = (type: AiXCourseType) => {
    setInput((prev) => {
      const exists = prev.selectedCourseTypes.includes(type);
      if (exists) {
        if (prev.selectedCourseTypes.length === 1) return prev;
        return { ...prev, selectedCourseTypes: prev.selectedCourseTypes.filter((t) => t !== type) };
      }
      const next = [...prev.selectedCourseTypes, type].slice(-2);
      return { ...prev, selectedCourseTypes: next };
    });
  };

  const handleGenerateReport = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
input,
  passcode: passcode || sessionStorage.getItem('gnu_aix_verified_passcode') || passcodeInput.trim(),
}),
      });
      const data = await res.json();
      if (res.status === 401) {
        handleLockOut();
        throw new Error(data.error || '인증이 만료되었습니다. 입장 코드를 다시 입력해 주세요.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'AI 보고서 생성에 실패했습니다.');
      }
      setReport(data.report);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadHwpx = async () => {
    if (!report) return;
    setIsDownloading(true);
    setErrorMsg(null);
    try {
      const blob = await generateAiXReportHwpx(report, {
        templateUrl: '/templates/base_template.hwpx',
        removeSubmissionGuidePage: removeGuidePage,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.department}_${report.courseTitleKo}_AI-X_결과보고서.hwpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : '.hwpx 파일 생성 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  // 잠금 화면 렌더링
  if (!isUnlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-sm">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-center text-xl font-bold text-slate-900">
            경상국립대학교 AI-X 설계 가이드
          </h1>
          <p className="mt-1.5 text-center text-xs leading-relaxed text-slate-500">
            2026학년도 국립대학육성사업 참여 교원 전용 시스템입니다.
            <br />
            교육혁신처에서 안내받으신 <strong>참여 입장 코드</strong>를 입력해 주세요.
          </p>

          <form onSubmit={handleUnlock} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                참여 교원 입장 코드
              </label>
              <input
                type="password"
                required
                placeholder="입장 코드를 입력하세요"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm tracking-wider focus:border-blue-600 focus:outline-none"
              />
            </div>

            {authError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isCheckingAuth || !passcodeInput.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
            >
              {isCheckingAuth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>인증 후 보고서 작성 시작하기</span>
            </button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
            문의: GNU 교육혁신처 교육과정과(4877)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 font-bold text-white shadow-sm">
              AXIS
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                경상국립대학교 AI-X 교과목 개발·인증 결과보고서 자동 생성기
              </h1>
              <p className="text-xs text-slate-500">
                2026학년도 국립대학육성사업 | 교육혁신처 AXIS 교육체계 기반 HWPX 자동 조립 시스템
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {report && (
              <button
                type="button"
                onClick={() => setReport(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                입력 단계로 돌아가기
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setInput(SAMPLE_WIZARD_INPUT);
                setReport(null);
                setCurrentStep(1);
              }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              샘플 예시 불러오기
            </button>
            <button
              type="button"
              onClick={handleLockOut}
              title="화면 잠금"
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>잠금</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>오류 안내:</strong> {errorMsg}
          </div>
        )}

        {report ? (
          <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>AI-X 결과보고서 초안 생성 완료</span>
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  [{report.department}] {report.courseTitleKo}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  아래 항목을 검토·수정하신 뒤 우측 버튼을 누르면 대학 표준 서식(.hwpx) 파일로 즉시 다운로드됩니다.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={handleDownloadHwpx}
                  disabled={isDownloading}
                  className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:opacity-50"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>최종 결과보고서 (.hwpx) 다운로드</span>
                </button>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={removeGuidePage}
                    onChange={(e) => setRemoveGuidePage(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>제출 시 불필요한 2쪽 &apos;작성 및 제출 요령&apos; 페이지 자동 삭제</span>
                </label>
              </div>
            </div>

            <div className="grid gap-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>연구 요약 (4쪽 수록 내용 - 직접 수정 가능)</span>
                </h3>
                <textarea
                  rows={6}
                  value={report.executiveSummary.join('\n\n')}
                  onChange={(e) =>
                    setReport({
                      ...report,
                      executiveSummary: e.target.value
                        .split(/\n{2,}/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 p-3.5 text-sm leading-relaxed focus:border-blue-500 focus:outline-none"
                />
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-bold text-slate-900">
                  Ⅰ~Ⅱ-1. 전공-AI 교육목표 정렬 및 통합 학습성과
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      기존 전공 학습목표
                    </label>
                    <textarea
                      rows={4}
                      value={report.table2_1_3.majorObjective}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          table2_1_3: { ...report.table2_1_3, majorObjective: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      종속된 AI 활용 목표
                    </label>
                    <textarea
                      rows={4}
                      value={report.table2_1_3.subordinatedAiObjective}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          table2_1_3: {
                            ...report.table2_1_3,
                            subordinatedAiObjective: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-blue-700">
                      최종 통합 학습성과 (Bloom 행동동사)
                    </label>
                    <textarea
                      rows={4}
                      value={report.table2_1_3.integratedLearningOutcome}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          table2_1_3: {
                            ...report.table2_1_3,
                            integratedLearningOutcome: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-blue-300 bg-blue-50/30 p-2.5 text-sm"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-bold text-slate-900">
                  Ⅱ-3. 15주 전체 주차별 수업운영 계획 ([표 Ⅱ-3.1])
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                        <th className="w-14 p-2.5 text-center">주차</th>
                        <th className="p-2.5">강의 주제 및 세부 내용</th>
                        <th className="w-28 p-2.5">강의방법</th>
                        <th className="w-32 p-2.5">비고(모듈)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {report.weeklyPlans.map((wp, idx) => (
                        <tr key={wp.week} className="hover:bg-slate-50">
                          <td className="p-2.5 text-center font-bold">{wp.week}주</td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={wp.title}
                              onChange={(e) => {
                                const updated = [...report.weeklyPlans];
                                updated[idx] = { ...wp, title: e.target.value };
                                setReport({ ...report, weeklyPlans: updated });
                              }}
                              className="mb-1 w-full rounded border border-slate-200 px-2 py-1 font-semibold text-slate-900"
                            />
                            <p className="text-slate-600">{wp.details.join(' / ')}</p>
                          </td>
                          <td className="p-2.5 text-slate-700">{wp.method}</td>
                          <td className="p-2.5">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                wp.note.includes('모듈') || wp.note.includes('AI')
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {wp.note}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-base font-bold text-slate-900">
                  Ⅱ-5 & 부록 4. 경상국립대학교 GNU-AXIS 디지털 배지 정보
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">배지명</label>
                    <input
                      type="text"
                      value={report.digitalBadge.badgeName}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          digitalBadge: { ...report.digitalBadge, badgeName: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      직무·기술 키워드
                    </label>
                    <input
                      type="text"
                      value={report.digitalBadge.keywords.join(' ')}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          digitalBadge: {
                            ...report.digitalBadge,
                            keywords: e.target.value.split(/\s+/).filter(Boolean),
                          },
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    />
                  </div>
                </div>
              </section>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
                <strong>[다운로드 후 최종 제출 전 안내]</strong>
                <br />• 다운로드된 <code>.hwpx</code> 파일을 한컴오피스(한글)에서 여신 뒤,{' '}
                <strong>&lt;부록 1&gt; 강의계획서 캡처본</strong>,{' '}
                <strong>&lt;부록 2&gt; 외부 전문가 자문의견서 스캔본</strong>,{' '}
                <strong>&lt;부록 3&gt; 교육 이수증 사본</strong> 이미지를 해당 위치에 삽입해 주세요.
                <br />• 마지막으로 한글 상단 메뉴 <code>[도구] → [차례/색인] → [차례 만들기]</code> 또는
                목차 페이지 번호를 확인하신 뒤 저장하여 제출하시면 됩니다.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-6">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const active = currentStep === step.id;
                const passed = currentStep > step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                      active
                        ? 'bg-blue-700 text-white shadow-sm'
                        : passed
                        ? 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {step.id}. {step.title}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 1. 교과목 기본 정보 및 AI-X 유형·수준 진단
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      전공 계열을 선택하시면 이후 단계의 작성 예시와 추천 AI 도구가 학문 분야에 맞게 자동 설정됩니다.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700">연구 구분</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: 'new', label: 'AI-X 교과목 신규 개발' },
                          { val: 'cert', label: '기존 AI-X 교과목 인증' },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() =>
                              setInput({ ...input, researchType: opt.val as 'new' | 'cert' })
                            }
                            className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                              input.researchType === opt.val
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700">
                        전공 계열 선택 (맞춤 가이드 연동)
                      </label>
                      <select
                        value={input.academicField}
                        onChange={(e) =>
                          setInput({ ...input, academicField: e.target.value as AcademicField })
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium"
                      >
                        {(Object.keys(FIELD_PRESETS) as AcademicField[]).map((f) => (
                          <option key={f} value={f}>
                            {f} 계열
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">소속 학부(과)</label>
                      <input
                        type="text"
                        placeholder="예: 행정학과"
                        value={input.department}
                        onChange={(e) => setInput({ ...input, department: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">전공명 (선택)</label>
                      <input
                        type="text"
                        placeholder="예: 공공정책학전공"
                        value={input.major}
                        onChange={(e) => setInput({ ...input, major: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">연구책임자 성명</label>
                      <input
                        type="text"
                        placeholder="예: 홍길동"
                        value={input.professorName}
                        onChange={(e) => setInput({ ...input, professorName: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">교과목명 (국문)</label>
                      <input
                        type="text"
                        placeholder="예: 스마트 정책분석과 생성형 AI"
                        value={input.courseTitleKo}
                        onChange={(e) => setInput({ ...input, courseTitleKo: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">교과목명 (영문)</label>
                      <input
                        type="text"
                        placeholder="예: Smart Policy Analysis and Generative AI"
                        value={input.courseTitleEn}
                        onChange={(e) => setInput({ ...input, courseTitleEn: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">대상 학년/학기</label>
                      <input
                        type="text"
                        value={input.targetGradeSemester}
                        onChange={(e) => setInput({ ...input, targetGradeSemester: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">이수구분</label>
                      <select
                        value={input.courseClassification}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            courseClassification: e.target.value as '전필' | '전선',
                          })
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="전선">전공선택(전선)</option>
                        <option value="전필">전공필수(전필)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">학점</label>
                      <input
                        type="number"
                        value={input.credits}
                        onChange={(e) => setInput({ ...input, credits: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">이론 시수</label>
                      <input
                        type="number"
                        value={input.theoryHours}
                        onChange={(e) => setInput({ ...input, theoryHours: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">실습 시수</label>
                      <input
                        type="number"
                        value={input.practiceHours}
                        onChange={(e) =>
                          setInput({ ...input, practiceHours: Number(e.target.value) })
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-700">
                      AI-X 교과목 유형 진단 (주된 성격 1~2개 복수 선택 가능)
                    </label>
                    <div className="grid gap-2.5 sm:grid-cols-4">
                      {(
                        [
                          { type: '이해형', desc: 'AI 원리·윤리·전공 사례의 비판적 이해' },
                          { type: '활용형', desc: '과제 효율화 및 인간 책무성 기반 실습' },
                          { type: '분석형', desc: '대규모 데이터·텍스트 분석 및 사실 검증' },
                          { type: '창작·설계형', desc: '산출물·코드·설계안·콘텐츠 제작 및 수정' },
                        ] as const
                      ).map((item) => {
                        const selected = input.selectedCourseTypes.includes(item.type);
                        return (
                          <button
                            key={item.type}
                            type="button"
                            onClick={() => toggleCourseType(item.type)}
                            className={`rounded-xl border p-3 text-left transition ${
                              selected
                                ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-900">
                              {selected ? '☑' : '☐'} AI {item.type}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-600">{item.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-700">
                      학생 목표 역량 수준 (가이드라인 3단계 체계)
                    </label>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {(
                        [
                          {
                            lvl: 'Level 1',
                            title: 'Level 1 (Understand / 기초)',
                            desc: 'AI 실습 3주 이내, 기본 원리 이해 및 AI 답변의 오류·편향 식별 중심',
                          },
                          {
                            lvl: 'Level 2',
                            title: 'Level 2 (Apply / 심화 - 표준 권장)',
                            desc: 'AI 실습 4~8주, 전공 문제 맞춤 AI 적용 및 공식 문헌·통계 대조 검증',
                          },
                          {
                            lvl: 'Level 3',
                            title: 'Level 3 (Create / 확장)',
                            desc: 'AI 실습 9주 이상, 실전 산출물·프로토타입 제작 및 검증 절차 자체 설계',
                          },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.lvl}
                          type="button"
                          onClick={() =>
                            setInput({
                              ...input,
                              targetCompetencyLevel: item.lvl as CompetencyLevel,
                            })
                          }
                          className={`rounded-xl border p-3 text-left transition ${
                            input.targetCompetencyLevel === item.lvl
                              ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-indigo-950">{item.title}</div>
                          <div className="mt-1 text-[11px] text-slate-600">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 2. 전공 문제 정의 및 전공-AI 연계 설계
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      교수님의 평이한 수업 메모를 입력하시면 AI가 Ⅰ장 배경, 4대 연계 모델, Bloom 통합 학습성과, 5대 최소 요건 표를 자동 완성합니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950">
                    <div className="flex items-center gap-1.5 font-bold text-blue-800">
                      <HelpCircle className="h-4 w-4" />
                      <span>[{input.academicField} 계열] 맞춤형 설계 가이드</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>
                        <strong>지향 방향:</strong> {preset.direction}
                      </li>
                      <li>
                        <strong>권장 연계 모델:</strong> {preset.recommendedModels}
                      </li>
                      <li>
                        <strong>대표 산출물 예시:</strong> {preset.sampleDeliverables}
                      </li>
                    </ul>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      1) 기존 전공 학습목표 (이 수업에서 학생이 익혀야 할 핵심 전공 이론·개념)
                    </label>
                    <textarea
                      rows={3}
                      value={input.existingMajorGoal}
                      onChange={(e) => setInput({ ...input, existingMajorGoal: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      2) 기존 수업의 한계점 (전통적 수업 방식에서 시간·자원 제약 등으로 어려웠던 점)
                    </label>
                    <textarea
                      rows={3}
                      placeholder={preset.limitPlaceholder}
                      value={input.existingCourseLimit}
                      onChange={(e) => setInput({ ...input, existingCourseLimit: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      3) AI 도입 핵심 아이디어 (어떤 AI 도구로 학생들에게 어떤 활동을 시키고 싶으신가요?)
                    </label>
                    <textarea
                      rows={4}
                      placeholder={preset.aiIdeaPlaceholder}
                      value={input.aiIntegrationIdea}
                      onChange={(e) => setInput({ ...input, aiIntegrationIdea: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 3. 담당 교원 AI 역량 자가진단(20문항) 및 학습자 지원
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      문항을 클릭하시면 5대 영역별 평균 점수와 판정 수준(Acquire / Deepen / Create)이 자동 계산되며, 취약 영역에 맞춘 계발 계획이 자동 생성됩니다.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[1, 2, 3, 4, 5].map((idx) => {
                      const info = getAreaAvg(idx);
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center"
                        >
                          <div className="text-[11px] font-semibold text-slate-500">영역 {idx}</div>
                          <div className="mt-0.5 text-base font-bold text-blue-700">{info.avg}점</div>
                          <div className="text-[11px] font-medium text-slate-700">{info.stage}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-2.5">영역</th>
                          <th className="p-2.5">자가진단 문항 (1: 전혀 아니다 ~ 5: 매우 그렇다)</th>
                          <th className="w-44 p-2.5 text-center">점수 선택</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {FACULTY_DIAGNOSIS_QUESTIONS.map((q, qIdx) => (
                          <tr key={q.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-medium text-slate-500">{q.areaName}</td>
                            <td className="p-2.5 text-slate-800">
                              {q.id}. {q.text}
                            </td>
                            <td className="p-2.5">
                              <div className="flex justify-center gap-1">
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <button
                                    key={score}
                                    type="button"
                                    onClick={() => {
                                      const next = [...input.facultyScores];
                                      next[qIdx] = score;
                                      setInput({ ...input, facultyScores: next });
                                    }}
                                    className={`h-7 w-7 rounded-lg text-xs font-bold ${
                                      input.facultyScores[qIdx] === score
                                        ? 'bg-blue-700 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {score}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      1주차 학생 진단 후 수준별 비계(Scaffolding) 지원 메모 (선택)
                    </label>
                    <textarea
                      rows={2}
                      value={input.scaffoldingNote}
                      onChange={(e) => setInput({ ...input, scaffoldingNote: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        &lt;부록 3&gt; 최근 1년 이내 AI 교육·AXIS 워크숍 이수 실적
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setInput({
                            ...input,
                            trainingRecords: [
                              ...input.trainingRecords,
                              {
                                programName: '',
                                organizer: '경상국립대학교 AI융합원',
                                date: '2026.09.',
                                hours: '2시간',
                                participant: input.professorName,
                              },
                            ],
                          })
                        }
                        className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        <Plus className="h-3.5 w-3.5" /> 이수 내역 추가
                      </button>
                    </div>
                    <div className="space-y-2">
                      {input.trainingRecords.map((rec, rIdx) => (
                        <div key={rIdx} className="grid grid-cols-12 gap-2">
                          <input
                            type="text"
                            placeholder="프로그램명"
                            value={rec.programName}
                            onChange={(e) => {
                              const next = [...input.trainingRecords];
                              next[rIdx] = { ...rec, programName: e.target.value };
                              setInput({ ...input, trainingRecords: next });
                            }}
                            className="col-span-5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="주관기관"
                            value={rec.organizer}
                            onChange={(e) => {
                              const next = [...input.trainingRecords];
                              next[rIdx] = { ...rec, organizer: e.target.value };
                              setInput({ ...input, trainingRecords: next });
                            }}
                            className="col-span-3 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="이수일자"
                            value={rec.date}
                            onChange={(e) => {
                              const next = [...input.trainingRecords];
                              next[rIdx] = { ...rec, date: e.target.value };
                              setInput({ ...input, trainingRecords: next });
                            }}
                            className="col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                          <div className="col-span-2 flex gap-1">
                            <input
                              type="text"
                              placeholder="시간"
                              value={rec.hours}
                              onChange={(e) => {
                                const next = [...input.trainingRecords];
                                next[rIdx] = { ...rec, hours: e.target.value };
                                setInput({ ...input, trainingRecords: next });
                              }}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                            />
                            {input.trainingRecords.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setInput({
                                    ...input,
                                    trainingRecords: input.trainingRecords.filter(
                                      (_, i) => i !== rIdx
                                    ),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 4. 15주 수업운영 계획 및 완결형 AI-X 모듈 설계
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      핵심 주차 키워드만 적어주시면 1주차 사전진단·윤리 안내부터 15주차 기말발표까지 나선형 심화 구조의 15주 전체 계획표와 6대 구성요소 모듈 설계서가 자동 생성됩니다.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      1) 15주 전체 수업 흐름 개요 (기존 강의계획서 내용을 붙여넣거나 핵심 주차만 요약)
                    </label>
                    <textarea
                      rows={4}
                      value={input.syllabusOutline}
                      onChange={(e) => setInput({ ...input, syllabusOutline: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        2) 대표 완결형 AI-X 모듈명
                      </label>
                      <input
                        type="text"
                        value={input.moduleName}
                        onChange={(e) => setInput({ ...input, moduleName: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        3) 집중 운영 주차 및 시수 (최소 4주 이상 권장)
                      </label>
                      <input
                        type="text"
                        value={input.moduleWeeks}
                        onChange={(e) => setInput({ ...input, moduleWeeks: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        4) 학생 최종 제출 산출물 형태
                      </label>
                      <input
                        type="text"
                        value={input.finalDeliverable}
                        onChange={(e) => setInput({ ...input, finalDeliverable: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        5) 주 활용 AI 도구 및 무료 대체 도구
                      </label>
                      <input
                        type="text"
                        value={input.primaryTools}
                        onChange={(e) => setInput({ ...input, primaryTools: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 5. 지능형 다차원 평가 루브릭 및 형성평가 체계
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      가이드라인에 따라 &apos;결과 검증(Fact-Check)&apos;과 &apos;인간 판단 및 수정&apos; 배점 합계가 30~40% 이상이 되도록 설정해 주세요.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs">
                      <span className="font-semibold text-slate-600">전체 배점 합계: </span>
                      <span
                        className={`text-base font-bold ${
                          totalWeight === 100 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {totalWeight}%
                      </span>
                      <span className="text-slate-400"> / 100%</span>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-slate-600">
                        인간 책무성(결과 검증 + 인간 판단) 비중:{' '}
                      </span>
                      <span
                        className={`text-base font-bold ${
                          humanAccountabilityRatio >= 30 ? 'text-blue-700' : 'text-amber-600'
                        }`}
                      >
                        {humanAccountabilityRatio}%
                      </span>
                      <span className="ml-1 text-[11px] text-slate-500">(권장: 30~40% 이상)</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {DEFAULT_RUBRIC_WEIGHTS.map((item, idx) => (
                      <div key={item.area} className="flex items-center gap-4">
                        <span className="w-52 text-xs font-semibold text-slate-700">
                          {item.area}
                        </span>
                        <input
                          type="range"
                          min={5}
                          max={40}
                          step={5}
                          value={input.rubricWeights[idx]}
                          onChange={(e) => {
                            const next = [...input.rubricWeights];
                            next[idx] = Number(e.target.value);
                            setInput({ ...input, rubricWeights: next });
                          }}
                          className="h-2 flex-1 cursor-pointer accent-blue-700"
                        />
                        <span className="w-12 text-right text-xs font-bold text-slate-900">
                          {input.rubricWeights[idx]}%
                        </span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      AI 산출물 사실 검증(Fact-check) 대조 준거 자료
                    </label>
                    <input
                      type="text"
                      value={input.verificationStandard}
                      onChange={(e) =>
                        setInput({ ...input, verificationStandard: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700">
                      생성형 AI 기반 형성평가 피드백 운영 방식
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          val: 'llm_prompt',
                          title: '1단계: 수업자료·루브릭 프롬프트 첨부 방식 (범용 LLM)',
                          desc: '별도 DB 구축 없이 교수자가 배포한 표준 프롬프트와 루브릭을 활용해 학생이 초안을 자기점검',
                        },
                        {
                          val: 'rag_kb',
                          title: '2단계: 교과목 전용 RAG 지식베이스 연동 방식',
                          desc: '강의노트·평가기준·우수사례를 검색 기반 지식베이스로 구축하여 수업 맥락에 한정된 피드백 제공',
                        },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() =>
                            setInput({
                              ...input,
                              formativeFeedbackType: opt.val as 'llm_prompt' | 'rag_kb',
                            })
                          }
                          className={`rounded-xl border p-3.5 text-left ${
                            input.formativeFeedbackType === opt.val
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">{opt.title}</div>
                          <div className="mt-1 text-[11px] text-slate-600">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 6 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Step 6. 성과 가치화(디지털 배지) 및 2027학년도 정규 개설 계획
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      입력하신 내용은 Ⅰ장(학과 로드맵), Ⅱ-5장, 결론 총괄표([표 Ⅳ-1]), 그리고 &lt;부록 4&gt; 디지털 배지 서식에 동시에 자동 반영됩니다.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        2027학년도 정규 개설 학기
                      </label>
                      <input
                        type="text"
                        value={input.openSemester}
                        onChange={(e) => setInput({ ...input, openSemester: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        수강 대상 및 예상 정원
                      </label>
                      <input
                        type="text"
                        value={input.expectedCapacity}
                        onChange={(e) => setInput({ ...input, expectedCapacity: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      강의실 및 실습 환경 계획
                    </label>
                    <input
                      type="text"
                      value={input.classroomEnv}
                      onChange={(e) => setInput({ ...input, classroomEnv: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        학과 선수 연계 과목 (Ⅰ장 로드맵용, 선택)
                      </label>
                      <input
                        type="text"
                        value={input.prevCourseName}
                        onChange={(e) => setInput({ ...input, prevCourseName: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        학과 후속 심화·캡스톤 연계 과목 (선택)
                      </label>
                      <input
                        type="text"
                        value={input.nextCourseName}
                        onChange={(e) => setInput({ ...input, nextCourseName: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      GNU-AXIS 디지털 배지 직무·기술 해시태그
                    </label>
                    <input
                      type="text"
                      value={input.badgeKeywords}
                      onChange={(e) => setInput({ ...input, badgeKeywords: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                  disabled={currentStep === 1}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>이전 단계</span>
                </button>

                {currentStep < 6 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => Math.min(6, s + 1))}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <span>다음 단계</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGenerating || totalWeight !== 100}
                    className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>AI가 세부 근거 및 수업 전략이 담긴 보고서 초안을 작성 중입니다...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>생성형 AI로 결과보고서 초안 생성하기</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}