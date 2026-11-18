import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Schema, Type } from '@google/genai';
import { AiXReportData, FacultyStage } from '@/types/report';
import {
  DEFAULT_RUBRIC_WEIGHTS,
  FIELD_PRESETS,
  WizardFormInput,
} from '@/constants/axisPresets';

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

/* ============================================================================
 * Part 1 스키마: 요약, Ⅰ장(배경·로드맵), Ⅱ-1장(연계·목표·5대요건), Ⅱ-2장(진단·교원역량)
 * ========================================================================== */
const part1Schema: Schema = {
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
  ],
};

/* ============================================================================
 * Part 2 스키마: Ⅱ-3장(15주·모듈·도구), Ⅱ-4장(루브릭·증빙·피드백), Ⅱ-5장 & Ⅳ장(배지·개설·결론)
 * ========================================================================== */
const part2Schema: Schema = {
  type: Type.OBJECT,
  properties: {
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
        { error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body = await req.json();

    const expectedPasscode = process.env.ACCESS_PASSCODE || 'GNU2026AXIS';
    if (!body.passcode || String(body.passcode).trim() !== expectedPasscode.trim()) {
      return NextResponse.json(
        { error: '유효하지 않은 참여 코드입니다. 다시 로그인해 주세요.' },
        { status: 401 }
      );
    }

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
교수자가 입력한 전공 교과목 아이디어를 바탕으로, 2026학년도 국립대학육성사업 「AI 융합 교육과정 개발 및 인증 연구 결과보고서」의 모든 표와 항목을 교육공학적·행정적 기준에 맞춰 개조식(~함, ~임, ~운영함)으로 작성하십시오.
각 표의 셀에는 반드시 ① 전공 이론·현장 수요 기반의 '설계 근거(Why)'와 ② 실제 강의실 실행 절차가 담긴 '수업 운영 전략(How)'이 구체적으로 드러나야 합니다.`;

    const commonContext = `
- 연구 구분: ${input.researchType === 'new' ? 'AI-X 교과목 신규 개발' : '기존 AI-X 교과목 인증'}
- 전공 계열: ${input.academicField} (${fieldPreset.direction})
- 소속 학부(과)/전공: ${input.department} ${input.major}
- 교과목명(국문/영문): ${input.courseTitleKo} / ${input.courseTitleEn}
- 개설 학년·학기 / 이수구분 / 학점-이론-실습: ${input.targetGradeSemester} / ${input.courseClassification} / ${input.credits}-${input.theoryHours}-${input.practiceHours}
- 담당교원: ${input.professorName}
- AI-X 교과목 유형: ${input.selectedCourseTypes.join(', ')}
- 학생 목표 역량 수준: ${input.targetCompetencyLevel}
- 기존 전공 학습목표: ${input.existingMajorGoal}
- 기존 수업의 한계점: ${input.existingCourseLimit}
- AI 도입 핵심 아이디어: ${input.aiIntegrationIdea}
- 교원 자가진단 영역별 점수: ①AI기초(${s1}, ${calcStage(s1)}), ②융합설계(${s2}, ${calcStage(s2)}), ③수업운영(${s3}, ${calcStage(s3)}), ④AI윤리(${s4}, ${calcStage(s4)}), ⑤성찰계발(${s5}, ${calcStage(s5)})
- 학생 비계 지원 메모: ${input.scaffoldingNote}
- 15주 수업 개요 메모: ${input.syllabusOutline}
- 핵심 완결형 AI-X 모듈: ${input.moduleName} (${input.moduleWeeks})
- 최종 학생 산출물: ${input.finalDeliverable}
- 활용 AI 도구: ${input.primaryTools}
- 다차원 루브릭 배점(%): 전공문제이해(${input.rubricWeights[0]}), AI활용전략(${input.rubricWeights[1]}), 과정투명성(${input.rubricWeights[2]}), 결과검증(${input.rubricWeights[3]}), 인간판단·수정(${input.rubricWeights[4]}), AI윤리·보안(${input.rubricWeights[5]}), 최종산출물(${input.rubricWeights[6]})
- 사실 검증 기준: ${input.verificationStandard}
- 형성평가 방식: ${input.formativeFeedbackType === 'rag_kb' ? '2단계: 교과목 전용 RAG 지식베이스 피드백' : '1단계: 수업자료·루브릭 프롬프트 첨부 LLM 피드백'}
- 2027학년도 개설 학기 / 정원 / 환경: ${input.openSemester} / ${input.expectedCapacity} / ${input.classroomEnv}
- 선수과목 / 후속과목: ${input.prevCourseName || '기초 교양 AI 교과'} / ${input.nextCourseName || '전공 심화 캡스톤디자인 및 AX 마이크로디그리'}
- 디지털 배지 키워드: ${input.badgeKeywords}`;

    // 전반부(Part 1)와 후반부(Part 2)를 동시에 병렬 생성하여 응답 시간을 절반 이하로 단축
    const [resPart1, resPart2] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `다음 교과목 정보를 바탕으로 보고서 전반부(연구 요약, Ⅰ장 배경·로드맵, Ⅱ-1장 연계·목표·5대요건, Ⅱ-2장 학생 비계 전략·교원 역량 계발 계획)를 생성하세요. 각 항목은 설계 근거와 운영 전략이 담긴 2~3줄 개조식으로 작성합니다.\n${commonContext}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: part1Schema,
          temperature: 0.35,
        },
      }),
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `다음 교과목 정보를 바탕으로 보고서 후반부(Ⅱ-3장 15주 전체 수업계획·완결형 모듈 6대 요소·도구 안전성, Ⅱ-4장 7대 루브릭·과정증빙 예시·형성평가 프롬프트, Ⅱ-5장 디지털 배지·2027 정규개설/CQI, Ⅳ장 결론·기대효과)를 생성하세요. weeklyPlans는 1~15주(15개), rubricLevels는 7개를 정확히 채우세요.\n${commonContext}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: part2Schema,
          temperature: 0.35,
        },
      }),
    ]);

    if (!resPart1.text || !resPart2.text) {
      throw new Error('AI 응답 생성이 불완전합니다. 다시 시도해 주세요.');
    }

    const p1 = safeParseJson(resPart1.text);
    const p2 = safeParseJson(resPart2.text);

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

      executiveSummary: p1.executiveSummary || [],
      table1_1: p1.table1_1,
      roadmapRows: p1.roadmapRows || [],

      selectedCourseTypes: input.selectedCourseTypes,
      typeDiagnosisRationale: p1.typeDiagnosisRationale || [],
      targetCompetencyLevel: input.targetCompetencyLevel,
      table2_1_2: p1.table2_1_2,
      table2_1_3: p1.table2_1_3,
      table2_1_4_requirements: p1.table2_1_4_requirements,

      scaffoldingPlans: p1.scaffoldingPlans,
      facultyCompetency: {
        area1: { score: s1, stage: calcStage(s1), plans: p1.facultyPlansByArea?.area1 || [] },
        area2: { score: s2, stage: calcStage(s2), plans: p1.facultyPlansByArea?.area2 || [] },
        area3: { score: s3, stage: calcStage(s3), plans: p1.facultyPlansByArea?.area3 || [] },
        area4: { score: s4, stage: calcStage(s4), plans: p1.facultyPlansByArea?.area4 || [] },
        area5: { score: s5, stage: calcStage(s5), plans: p1.facultyPlansByArea?.area5 || [] },
        overallScore,
        overallStage,
        overallPlan: p1.facultyPlansByArea?.overallPlan || '',
      },

      weeklyPlans: p2.weeklyPlans || [],
      moduleDesign: {
        moduleName: input.moduleName,
        moduleScheduleNote: input.moduleWeeks,
        ...p2.moduleDesign,
      },
      aiToolSafetyRows: p2.aiToolSafetyRows || [],

      rubricRows: DEFAULT_RUBRIC_WEIGHTS.map((base, idx) => ({
        area: base.area,
        weight: input.rubricWeights[idx] ?? base.weight,
        level4: p2.rubricLevels?.[idx]?.level4 || '',
        level3: p2.rubricLevels?.[idx]?.level3 || '',
        level2: p2.rubricLevels?.[idx]?.level2 || '',
        level1: p2.rubricLevels?.[idx]?.level1 || '',
      })),
      evidenceFormExample: p2.evidenceFormExample,
      formativePrompts: p2.formativePrompts,

      digitalBadge: p2.digitalBadge,
      openingPlan2027: p2.openingPlan2027,

      conclusionSummary: {
        moduleSummary: p2.conclusionSummary?.moduleSummary || [
          `${input.moduleName} (${input.moduleWeeks})`,
        ],
        humanAccountabilityWeight: humanAccWeight,
        finalProductWeight: finalProdWeight,
      },
      expectedEffects: p2.expectedEffects,
      trainingRecords: input.trainingRecords || [],
    };

    return NextResponse.json({ report: finalReport });
  } catch (err: unknown) {
    console.error('Report generation error:', err);
    const message = err instanceof Error ? err.message : '보고서 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}