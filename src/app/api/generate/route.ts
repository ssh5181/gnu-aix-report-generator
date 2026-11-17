import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Schema, Type } from '@google/genai';
import { AiXReportData, FacultyStage } from '@/types/report';
import {
  DEFAULT_RUBRIC_WEIGHTS,
  FIELD_PRESETS,
  WizardFormInput,
} from '@/constants/axisPresets';

// Vercel 등 클라우드 배포 시 AI 보고서 생성(약 20~35초) 중 타임아웃 방지
export const maxDuration = 60;

function calcStage(avg: number): FacultyStage {
  if (avg < 2.5) return 'Acquire';
  if (avg < 4.0) return 'Deepen';
  return 'Create';
}

function avgOf(nums: number[]): number {
  if (nums.length === 0) return 3.0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Number((sum / nums.length).toFixed(1));
}

function safeParseJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
  return JSON.parse(cleaned);
}

const stringArraySchema: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

const reportResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: stringArraySchema,
    table1_1: {
      type: Type.OBJECT,
      properties: {
        envProblem: stringArraySchema,
        envSolution: stringArraySchema,
        deptProblem: stringArraySchema,
        deptSolution: stringArraySchema,
        goalProblem: stringArraySchema,
        goalSolution: stringArraySchema,
      },
      required: ['envProblem', 'envSolution', 'deptProblem', 'deptSolution', 'goalProblem', 'goalSolution'],
    },
    roadmapRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stage: { type: Type.STRING },
          courseName: { type: Type.STRING },
          category: { type: Type.STRING },
          creditInfo: { type: Type.STRING },
          yearSemester: { type: Type.STRING },
          targetLevel: { type: Type.STRING },
          contents: stringArraySchema,
        },
        required: ['stage', 'courseName', 'category', 'creditInfo', 'yearSemester', 'targetLevel', 'contents'],
      },
    },
    typeDiagnosisRationale: stringArraySchema,
    table2_1_2: {
      type: Type.OBJECT,
      properties: {
        existingLimit: { type: Type.STRING },
        aiNecessity: { type: Type.STRING },
        linkageModels: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              modelName: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['modelName', 'description'],
          },
        },
      },
      required: ['existingLimit', 'aiNecessity', 'linkageModels'],
    },
    table2_1_3: {
      type: Type.OBJECT,
      properties: {
        majorObjective: { type: Type.STRING },
        subordinatedAiObjective: { type: Type.STRING },
        integratedLearningOutcome: { type: Type.STRING },
      },
      required: ['majorObjective', 'subordinatedAiObjective', 'integratedLearningOutcome'],
    },
    table2_1_4_requirements: {
      type: Type.OBJECT,
      properties: {
        majorCentric: { type: Type.STRING },
        aiIntegration: { type: Type.STRING },
        studentAgency: { type: Type.STRING },
        ethics: { type: Type.STRING },
        evaluability: { type: Type.STRING },
      },
      required: ['majorCentric', 'aiIntegration', 'studentAgency', 'ethics', 'evaluability'],
    },
    scaffoldingPlans: {
      type: Type.OBJECT,
      properties: {
        q1Plan: stringArraySchema,
        q2Plan: stringArraySchema,
        q3Plan: stringArraySchema,
        q4Plan: stringArraySchema,
      },
      required: ['q1Plan', 'q2Plan', 'q3Plan', 'q4Plan'],
    },
    facultyPlansByArea: {
      type: Type.OBJECT,
      properties: {
        area1: stringArraySchema,
        area2: stringArraySchema,
        area3: stringArraySchema,
        area4: stringArraySchema,
        area5: stringArraySchema,
        overallPlan: { type: Type.STRING },
      },
      required: ['area1', 'area2', 'area3', 'area4', 'area5', 'overallPlan'],
    },
    weeklyPlans: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          week: { type: Type.INTEGER },
          title: { type: Type.STRING },
          details: stringArraySchema,
          method: { type: Type.STRING },
          equipment: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['week', 'title', 'details', 'method', 'equipment', 'note'],
      },
    },
    moduleDesign: {
      type: Type.OBJECT,
      properties: {
        majorGoal: stringArraySchema,
        aiGoal: stringArraySchema,
        tools: stringArraySchema,
        procedures: stringArraySchema,
        deliverables: stringArraySchema,
        usageRules: stringArraySchema,
      },
      required: ['majorGoal', 'aiGoal', 'tools', 'procedures', 'deliverables', 'usageRules'],
    },
    aiToolSafetyRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          functionName: { type: Type.STRING },
          primaryTool: { type: Type.STRING },
          freeAlternative: { type: Type.STRING },
          activities: stringArraySchema,
          safetyMeasures: stringArraySchema,
        },
        required: ['functionName', 'primaryTool', 'freeAlternative', 'activities', 'safetyMeasures'],
      },
    },
    rubricLevels: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          level4: { type: Type.STRING },
          level3: { type: Type.STRING },
          level2: { type: Type.STRING },
          level1: { type: Type.STRING },
        },
        required: ['level4', 'level3', 'level2', 'level1'],
      },
    },
    evidenceFormExample: {
      type: Type.OBJECT,
      properties: {
        taskExampleTitle: { type: Type.STRING },
        aiClaimExample: { type: Type.STRING },
        verificationResultExample: { type: Type.STRING },
        evidenceSourceExample: { type: Type.STRING },
        actionExample: { type: Type.STRING },
      },
      required: ['taskExampleTitle', 'aiClaimExample', 'verificationResultExample', 'evidenceSourceExample', 'actionExample'],
    },
    formativePrompts: {
      type: Type.OBJECT,
      properties: {
        rubricCheckPrompt: { type: Type.STRING },
        factCheckPrompt: { type: Type.STRING },
        reflectionPrompt: { type: Type.STRING },
      },
      required: ['rubricCheckPrompt', 'factCheckPrompt', 'reflectionPrompt'],
    },
    digitalBadge: {
      type: Type.OBJECT,
      properties: {
        badgeName: { type: Type.STRING },
        badgeDescription: { type: Type.STRING },
        acquisitionCriteria: stringArraySchema,
        keywords: stringArraySchema,
      },
      required: ['badgeName', 'badgeDescription', 'acquisitionCriteria', 'keywords'],
    },
    openingPlan2027: {
      type: Type.OBJECT,
      properties: {
        semester: stringArraySchema,
        targetAndCapacity: stringArraySchema,
        environment: stringArraySchema,
        curriculumLinkage: stringArraySchema,
        cqiPlan: stringArraySchema,
      },
      required: ['semester', 'targetAndCapacity', 'environment', 'curriculumLinkage', 'cqiPlan'],
    },
    conclusionSummary: {
      type: Type.OBJECT,
      properties: {
        moduleSummary: stringArraySchema,
      },
      required: ['moduleSummary'],
    },
    expectedEffects: {
      type: Type.OBJECT,
      properties: {
        studentEffects: stringArraySchema,
        studentKpis: stringArraySchema,
        deptEffects: stringArraySchema,
        deptKpis: stringArraySchema,
      },
      required: ['studentEffects', 'studentKpis', 'deptEffects', 'deptKpis'],
    },
  },
  required: [
    'executiveSummary',
    'table1_1',
    'roadmapRows',
    'typeDiagnosisRationale',
    'table2_1_2',
    'table2_1_3',
    'table2_1_4_requirements',
    'scaffoldingPlans',
    'facultyPlansByArea',
    'weeklyPlans',
    'moduleDesign',
    'aiToolSafetyRows',
    'rubricLevels',
    'evidenceFormExample',
    'formativePrompts',
    'digitalBadge',
    'openingPlan2027',
    'conclusionSummary',
    'expectedEffects',
  ],
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인해 주세요.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const input: WizardFormInput = body.input;
    if (!input || !input.courseTitleKo) {
      return NextResponse.json({ error: '필수 교과목 입력 정보가 누락되었습니다.' }, { status: 400 });
    }

    const scores = input.facultyScores || Array(20).fill(3);
    const s1 = avgOf(scores.slice(0, 4));
    const s2 = avgOf(scores.slice(4, 8));
    const s3 = avgOf(scores.slice(8, 12));
    const s4 = avgOf(scores.slice(12, 16));
    const s5 = avgOf(scores.slice(16, 20));
    const overallScore = Number(((s1 + s2 + s3 + s4 + s5) / 5).toFixed(2));
    const overallStage = calcStage(overallScore);

    const fieldPreset = FIELD_PRESETS[input.academicField];
    const humanAccWeight = (input.rubricWeights[3] || 20) + (input.rubricWeights[4] || 20);
    const finalProdWeight = input.rubricWeights[6] || 10;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1beta' },
    });

    const systemInstruction = `당신은 경상국립대학교 교육혁신처의 'AI 융합 교육과정(AXIS) 설계 전문가'입니다.
교수자가 입력한 전공 교과목 아이디어를 바탕으로, 2026학년도 국립대학육성사업 「AI 융합 교육과정 개발 및 인증 연구 결과보고서」의 모든 표와 항목을 교육공학적·행정적 기준에 맞춰 작성해야 합니다.

[서술 밀도 및 내용 보강 핵심 지침]
1. 세부 근거(Why)와 수업 운영 전략(How)의 명시:
   - 모든 표의 셀을 추상적 미사여구나 단순 키워드 나열로 채우지 말고, 반드시 ① 전공 이론·현장 수요 기반의 '설계 근거'와 ② 교수자·학생의 실제 강의실 실행 절차가 담긴 '구체적 수업 운영 전략'을 결합하여 개조식(~함, ~임, ~운영함)으로 서술하십시오.
   - 분량은 표 레이아웃이 깨지지 않으면서도 심사위원이 즉시 실행 가능성을 확인할 수 있도록 항목당 2~3줄 내외의 알찬 밀도를 유지하십시오.
2. 표별 핵심 보강 포인트:
   - [표 Ⅰ-1, Ⅱ-1.2, Ⅱ-1.4]: 전공 교육의 구조적 한계 극복 논리와 5대 최소 요건(전공성·AI통합성·학생수행성·윤리성·평가가능성)별 수업 내 증빙·통제 장치를 구체적으로 서술하십시오.
   - [표 Ⅱ-2.1, Ⅱ-2.2]: 1주차 사전 진단(Q1~Q4) 결과에 따른 수준별 비계(Scaffolding) 자료 제공 시점과 운영 전략, 교원 자가진단 점수가 낮은 취약 영역의 집중 보완 연수·컨설팅 실행 계획을 구체화하십시오.
   - [표 Ⅱ-3.1, Ⅱ-3.2, Ⅱ-3.3]: 15주차 수업은 초반(기초 탐색)→중반(전공 데이터 분석 및 사실 검증)→후반(산출물 고도화 및 성찰)의 나선형 심화 전략이 드러나야 하며, 완결형 모듈 6대 요소(전공목표·AI목표·도구·활동절차·산출물·사용규칙)에는 차시별 [교수자 안내→학생 수행→AI 활용→인간 검증] 역할 분담과 무료 대체 도구·보안 조치를 명확히 기재하십시오.
   - [표 Ⅱ-4.1 ~ Ⅳ-2]: 결과 검증(Fact-Check)과 인간 판단·수정 역량을 변별하는 평가 기준, 형성평가 피드백 통제 규칙(정답 대필 차단), 2027학년도 정규 개설 후 3단계 CQI 환류 전략 및 정량 성과지표(KPI) 연계 방안을 구체적으로 서술하십시오.
3. 개수 및 정합성 엄수:
   - weeklyPlans는 반드시 1주차부터 15주차까지 15개 항목을 모두 채우고, rubricLevels는 7개 평가영역 순서대로 정확히 7개 항목을 채우십시오.`;

    const userPrompt = `다음 교수자 입력 정보를 바탕으로 각 표의 세부 근거와 구체적인 수업 운영 전략이 풍부하게 담긴 AI-X 연구결과 보고서 전체 데이터를 생성해 주세요.

- 연구 구분: ${input.researchType === 'new' ? 'AI-X 교과목 신규 개발' : '기존 AI-X 교과목 인증'}
- 전공 계열: ${input.academicField} (계열 지향점: ${fieldPreset.direction})
- 소속 학부(과)/전공: ${input.department} ${input.major}
- 교과목명(국문/영문): ${input.courseTitleKo} / ${input.courseTitleEn}
- 개설 학년·학기 / 이수구분 / 학점-이론-실습: ${input.targetGradeSemester} / ${input.courseClassification} / ${input.credits}-${input.theoryHours}-${input.practiceHours}
- 담당교원: ${input.professorName}
- AI-X 교과목 유형: ${input.selectedCourseTypes.join(', ')}
- 학생 목표 역량 수준: ${input.targetCompetencyLevel}
- 기존 전공 학습목표: ${input.existingMajorGoal}
- 기존 수업의 한계점: ${input.existingCourseLimit}
- AI 도입 핵심 아이디어: ${input.aiIntegrationIdea}
- 교원 자가진단 영역별 점수 및 단계:
  * ① AI 기초 이해: ${s1}점 (${calcStage(s1)})
  * ② 전공-AI 융합 설계: ${s2}점 (${calcStage(s2)})
  * ③ 수업 운영 및 학습자 지원: ${s3}점 (${calcStage(s3)})
  * ④ AI 윤리 및 학문적 정직성: ${s4}점 (${calcStage(s4)})
  * ⑤ 성찰과 지속적 계발: ${s5}점 (${calcStage(s5)})
- 학생 비계(Scaffolding) 지원 메모: ${input.scaffoldingNote}
- 15주 수업 개요 메모: ${input.syllabusOutline}
- 핵심 완결형 AI-X 모듈명 및 운영 주차: ${input.moduleName} (${input.moduleWeeks})
- 최종 학생 산출물: ${input.finalDeliverable}
- 활용 AI 도구: ${input.primaryTools}
- 다차원 루브릭 배점(%): 전공문제이해(${input.rubricWeights[0]}), AI활용전략(${input.rubricWeights[1]}), 과정투명성(${input.rubricWeights[2]}), 결과검증(${input.rubricWeights[3]}), 인간판단·수정(${input.rubricWeights[4]}), AI윤리·보안(${input.rubricWeights[5]}), 최종산출물(${input.rubricWeights[6]})
- AI 산출물 검증 기준: ${input.verificationStandard}
- 형성평가 피드백 운영 방식: ${input.formativeFeedbackType === 'rag_kb' ? '2단계: 교과목 전용 RAG 지식베이스 기반 피드백' : '1단계: 수업자료·루브릭 프롬프트 첨부 LLM 피드백'}
- 2027학년도 개설 학기 / 정원 / 실습환경: ${input.openSemester} / ${input.expectedCapacity} / ${input.classroomEnv}
- 학과 선수과목 / 후속과목: ${input.prevCourseName || '기초 교양 AI 교과'} / ${input.nextCourseName || '전공 심화 캡스톤디자인 및 AX 마이크로디그리'}
- 디지털 배지 키워드: ${input.badgeKeywords}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: reportResponseSchema,
        maxOutputTokens: 28000,
        temperature: 0.35,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error('AI 응답이 비어 있습니다.');
    }

    const generated = safeParseJson(rawText);

    const finalReport: AiXReportData = {
      researchType: input.researchType,
      department: input.department,
      major: input.major,
      courseTitleKo: input.courseTitleKo,
      courseTitleEn: input.courseTitleEn,
      projectTitle: `${input.courseTitleKo} AI-X 교과목 개발 및 인증 연구`,
      professorName: input.professorName,
      submissionMonth: '2026년 11월',
      targetGradeSemester: input.targetGradeSemester,
      courseClassification: input.courseClassification,
      credits: input.credits,
      theoryHours: input.theoryHours,
      practiceHours: input.practiceHours,

      executiveSummary: generated.executiveSummary || [],
      table1_1: generated.table1_1,
      roadmapRows: generated.roadmapRows || [],

      selectedCourseTypes: input.selectedCourseTypes,
      typeDiagnosisRationale: generated.typeDiagnosisRationale || [],
      targetCompetencyLevel: input.targetCompetencyLevel,
      table2_1_2: generated.table2_1_2,
      table2_1_3: generated.table2_1_3,
      table2_1_4_requirements: generated.table2_1_4_requirements,

      scaffoldingPlans: generated.scaffoldingPlans,
      facultyCompetency: {
        area1: { score: s1, stage: calcStage(s1), plans: generated.facultyPlansByArea?.area1 || [] },
        area2: { score: s2, stage: calcStage(s2), plans: generated.facultyPlansByArea?.area2 || [] },
        area3: { score: s3, stage: calcStage(s3), plans: generated.facultyPlansByArea?.area3 || [] },
        area4: { score: s4, stage: calcStage(s4), plans: generated.facultyPlansByArea?.area4 || [] },
        area5: { score: s5, stage: calcStage(s5), plans: generated.facultyPlansByArea?.area5 || [] },
        overallScore,
        overallStage,
        overallPlan: generated.facultyPlansByArea?.overallPlan || '',
      },

      weeklyPlans: generated.weeklyPlans || [],
      moduleDesign: {
        moduleName: input.moduleName,
        moduleScheduleNote: input.moduleWeeks,
        ...generated.moduleDesign,
      },
      aiToolSafetyRows: generated.aiToolSafetyRows || [],

      rubricRows: DEFAULT_RUBRIC_WEIGHTS.map((base, idx) => ({
        area: base.area,
        weight: input.rubricWeights[idx] ?? base.weight,
        level4: generated.rubricLevels?.[idx]?.level4 || '',
        level3: generated.rubricLevels?.[idx]?.level3 || '',
        level2: generated.rubricLevels?.[idx]?.level2 || '',
        level1: generated.rubricLevels?.[idx]?.level1 || '',
      })),
      evidenceFormExample: generated.evidenceFormExample,
      formativePrompts: generated.formativePrompts,

      digitalBadge: generated.digitalBadge,
      openingPlan2027: generated.openingPlan2027,

      conclusionSummary: {
        moduleSummary: generated.conclusionSummary?.moduleSummary || [
          `${input.moduleName} (${input.moduleWeeks})`,
        ],
        humanAccountabilityWeight: humanAccWeight,
        finalProductWeight: finalProdWeight,
      },
      expectedEffects: generated.expectedEffects,
      trainingRecords: input.trainingRecords || [],
    };

    return NextResponse.json({ report: finalReport });
  } catch (err: unknown) {
    console.error('Report generation error:', err);
    const message = err instanceof Error ? err.message : '보고서 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}