import { AiXCourseType, CompetencyLevel, RubricCriterionRow, TrainingRecordRow } from '@/types/report';

export type AcademicField = '인문사회' | '자연과학' | '공학' | '예체능' | '교육·융합';

export interface FieldPreset {
  direction: string;
  recommendedModels: string;
  sampleDeliverables: string;
  limitPlaceholder: string;
  aiIdeaPlaceholder: string;
  recommendedTools: {
    functionName: string;
    primaryTool: string;
    freeAlternative: string;
  }[];
}

export const FIELD_PRESETS: Record<AcademicField, FieldPreset> = {
  인문사회: {
    direction: '텍스트, 정책, 사회문제, 담론에 대한 AI 기반 대규모 정제·분석 및 사실 검증',
    recommendedModels: '개념 보완 모델 / 데이터 확장 모델',
    sampleDeliverables: '정책분석 보고서, 여론·담론 텍스트 분석 보고서, 사례비교 제안서',
    limitPlaceholder:
      '예: 기존 수업에서는 시간 제약으로 수십 건의 정책 보고서나 기사만 다루어 실제 사회의 방대한 비정형 여론 데이터를 분석하는 데 한계가 있었음.',
    aiIdeaPlaceholder:
      '예: LLM을 활용해 수백 건의 지역 청년 정책 민원·뉴스 텍스트를 1차 요약·분류하고, 학생이 공식 통계청·지자체 결산서와 대조 검증하여 정책 대안 보고서를 작성하게 함.',
    recommendedTools: [
      { functionName: '개념 이해 및 자료 탐색', primaryTool: 'ChatGPT (OpenAI)', freeAlternative: 'Google Gemini, Claude (Free)' },
      { functionName: '텍스트 처리 및 데이터 분석', primaryTool: 'Claude 3.5 Sonnet', freeAlternative: 'Voyant Tools, Google Colab' },
      { functionName: '형성평가 및 자기점검', primaryTool: '맞춤형 루브릭 프롬프트', freeAlternative: '범용 LLM 무료 버전' },
    ],
  },
  자연과학: {
    direction: '실험·관측 데이터에 대한 AI 기반 모델링, 패턴 탐색, 시각화 및 이론 대조 검증',
    recommendedModels: '데이터 확장 모델 / 과제 보조 모델',
    sampleDeliverables: '데이터 분석 보고서, 실험조건 예측 모델, 오차 검증 리포트',
    limitPlaceholder:
      '예: 대규모 실험·관측 데이터의 전처리와 다변량 시각화 실습에 많은 시간이 소요되어 정작 데이터에 담긴 자연과학적 원리를 깊이 해석할 시간이 부족했음.',
    aiIdeaPlaceholder:
      '예: 생성형 AI 코드 보조 도구와 Python(Google Colab)을 활용해 실험 데이터를 시각화·회귀 예측하고, 도출된 패턴이 전공 이론 및 문헌 수치와 일치하는지 검증하게 함.',
    recommendedTools: [
      { functionName: '개념 이해 및 문헌 탐색', primaryTool: 'Google Gemini', freeAlternative: 'ChatGPT Free, Perplexity' },
      { functionName: '데이터 분석 및 시각화', primaryTool: 'Python (Google Colab)', freeAlternative: 'Julius AI (무료 범위)' },
      { functionName: '형성평가 및 자기점검', primaryTool: '맞춤형 루브릭 프롬프트', freeAlternative: '범용 LLM 무료 버전' },
    ],
  },
  공학: {
    direction: '공학 설계, 시뮬레이션, 최적화, 바이브 코딩 및 이론 설계식 대비 오차 검증',
    recommendedModels: '산출물 생성 모델 / 과제 보조 모델',
    sampleDeliverables: '공정/시스템 예측 코드, 3D·CAD 설계안, 프로토타입 및 기술검증보고서',
    limitPlaceholder:
      '예: 수작업 계산과 기초 코딩 문법 습득에 수업 시간의 대부분을 소모하여, 실제 산업 현장의 복합 조건을 반영한 설계 대안 비교와 시뮬레이션 반복 개선이 어려웠음.',
    aiIdeaPlaceholder:
      '예: 생성형 AI를 활용해 공정 예측 모델 코드 또는 3D 레퍼런스 시안을 생성하고, 전공 설계방정식(이론값)과 대조하여 공학적 오류를 수정·구현하는 프로젝트를 수행함.',
    recommendedTools: [
      { functionName: '코드 생성 및 디버깅 보조', primaryTool: 'Claude / GitHub Copilot', freeAlternative: 'Google Colab 내장 AI, Gemini' },
      { functionName: '데이터 분석 및 예측 모델링', primaryTool: 'Python (scikit-learn)', freeAlternative: 'Google Colab (무료 GPU/CPU)' },
      { functionName: '형성평가 및 자기점검', primaryTool: '맞춤형 루브릭 프롬프트', freeAlternative: '범용 LLM 무료 버전' },
    ],
  },
  예체능: {
    direction: '이미지·영상·음성 멀티모달 생성, 콘셉트 탐색 및 인간 주도 창작·저작권 윤리 검증',
    recommendedModels: '산출물 생성 모델 / 개념 보완 모델',
    sampleDeliverables: 'AI 협업 디자인 포트폴리오, 콘셉트 시안 비교집, 창작 윤리·수정 성찰서',
    limitPlaceholder:
      '예: 초기 아이디어 시각화 및 다양한 스타일 시안 제작에 물리적 시간이 과다 소요되어, 작품의 미학적 완성도와 비평적 수정 과정을 충분히 경험하기 어려웠음.',
    aiIdeaPlaceholder:
      '예: 생성형 AI로 다수의 초기 콘셉트 시안을 탐색한 뒤, 저작권·표현 편향을 검토하고 학생 본인의 미학적 판단으로 재가공하여 최종 디자인 포트폴리오를 제작함.',
    recommendedTools: [
      { functionName: '콘셉트 기획 및 프롬프트 설계', primaryTool: 'ChatGPT / Gemini', freeAlternative: 'Google Gemini (무료)' },
      { functionName: '이미지·멀티모달 시안 생성', primaryTool: 'Adobe Firefly / Midjourney', freeAlternative: 'Bing Image Creator, Canva AI' },
      { functionName: '형성평가 및 자기점검', primaryTool: '맞춤형 루브릭 프롬프트', freeAlternative: '범용 LLM 무료 버전' },
    ],
  },
  '교육·융합': {
    direction: '교수학습 설계, 학습 데이터 분석, 맞춤형 비계(Scaffolding) 및 피드백 도구 제작',
    recommendedModels: '데이터 확장 모델 / 산출물 생성 모델',
    sampleDeliverables: 'AI 활용 수업지도안, 노코드 학습 챗봇 프로토타입, 평가 루브릭 및 검증보고서',
    limitPlaceholder:
      '예: 학습자 수준별 맞춤형 교수자료와 피드백 문항을 개별 제작하는 데 한계가 있어, 실제 교육 현장에 적용 가능한 적응형 교수설계 실습이 부족했음.',
    aiIdeaPlaceholder:
      '예: 생성형 AI와 노코드 챗봇 도구를 활용해 수준별 학습 비계 전략이 반영된 교육용 프로토타입을 설계·구현하고, 실제 학습자 테스트로 교육적 타당성을 검증함.',
    recommendedTools: [
      { functionName: '교수요목 및 시나리오 설계', primaryTool: 'Claude / ChatGPT', freeAlternative: 'Google Gemini (무료)' },
      { functionName: '프로토타입 및 학습도구 제작', primaryTool: '노코드 챗봇/앱 빌더', freeAlternative: 'GPTs / Gemini Gems / Google Sites' },
      { functionName: '형성평가 및 자기점검', primaryTool: '맞춤형 루브릭 프롬프트', freeAlternative: '범용 LLM 무료 버전' },
    ],
  },
};

export interface FacultyQuestion {
  id: number;
  areaIndex: 1 | 2 | 3 | 4 | 5;
  areaName: string;
  text: string;
}

export const FACULTY_DIAGNOSIS_QUESTIONS: FacultyQuestion[] = [
  // ① AI 기초 이해 (1~4)
  { id: 1, areaIndex: 1, areaName: '① AI 기초 이해', text: '나는 생성형 AI가 어떤 원리로 결과를 만들어 내는지 학생에게 설명할 수 있다.' },
  { id: 2, areaIndex: 1, areaName: '① AI 기초 이해', text: '나는 AI가 잘못된 정보(환각)를 생성할 수 있다는 점과 그 이유를 설명할 수 있다.' },
  { id: 3, areaIndex: 1, areaName: '① AI 기초 이해', text: '나는 내 전공 분야에서 활용 가능한 AI 기술의 종류를 알고 있다.' },
  { id: 4, areaIndex: 1, areaName: '① AI 기초 이해', text: '나는 특정 학습 과제에 AI를 쓰는 것이 적절한지 판단할 수 있다.' },
  // ② 전공-AI 융합 설계 (5~8)
  { id: 5, areaIndex: 2, areaName: '② 전공-AI 융합 설계', text: '나는 전공 학습목표와 AI 활용 목표를 연결하여 서술할 수 있다.' },
  { id: 6, areaIndex: 2, areaName: '② 전공-AI 융합 설계', text: '나는 AI 활동이 들어갈 주차와 활동 내용을 강의계획서에 명시할 수 있다.' },
  { id: 7, areaIndex: 2, areaName: '② 전공-AI 융합 설계', text: '나는 학생이 제출할 산출물의 형태를 사전에 구체적으로 정할 수 있다.' },
  { id: 8, areaIndex: 2, areaName: '② 전공-AI 융합 설계', text: '나는 수강생의 사전 AI 활용 수준을 고려하여 활동 난이도를 조정할 수 있다.' },
  // ③ 수업 운영과 학습자 지원 (9~12)
  { id: 9, areaIndex: 3, areaName: '③ 수업 운영 및 학습자 지원', text: '나는 수업 중 학생이 AI 사용에서 겪는 문제 상황에 대응할 수 있다.' },
  { id: 10, areaIndex: 3, areaName: '③ 수업 운영 및 학습자 지원', text: '나는 학생별 AI 활용 능력 차이를 파악하고 있다.' },
  { id: 11, areaIndex: 3, areaName: '③ 수업 운영 및 학습자 지원', text: '나는 AI 활용에 어려움을 겪는 학생에게 대체 방법을 제시할 수 있다.' },
  { id: 12, areaIndex: 3, areaName: '③ 수업 운영 및 학습자 지원', text: '나는 유료 도구에 접근하기 어려운 학생을 위한 대체 도구를 준비하고 있다.' },
  // ④ AI 윤리와 학문적 정직성 (13~16)
  { id: 13, areaIndex: 4, areaName: '④ AI 윤리 및 학문적 정직성', text: '나는 내 수업에서 AI 사용이 허용되는 범위와 금지되는 행위를 문서로 안내한다.' },
  { id: 14, areaIndex: 4, areaName: '④ AI 윤리 및 학문적 정직성', text: '나는 학생에게 AI 사용 사실의 출처 표기 방법을 지도한다.' },
  { id: 15, areaIndex: 4, areaName: '④ AI 윤리 및 학문적 정직성', text: '나는 학생이 AI 산출물을 전공 지식으로 검증하도록 요구한다.' },
  { id: 16, areaIndex: 4, areaName: '④ AI 윤리 및 학문적 정직성', text: '나는 개인정보·저작권과 관련한 AI 사용상의 주의사항을 안내한다.' },
  // ⑤ 성찰과 지속적 계발 (17~20)
  { id: 17, areaIndex: 5, areaName: '⑤ 성찰과 지속적 계발', text: '나는 내 AI 활용 역량의 부족한 부분을 구체적으로 알고 있다.' },
  { id: 18, areaIndex: 5, areaName: '⑤ 성찰과 지속적 계발', text: '나는 최근 1년 이내에 AI 관련 연수나 학습 활동에 참여한 적이 있다.' },
  { id: 19, areaIndex: 5, areaName: '⑤ 성찰과 지속적 계발', text: '나는 동료 교원과 AI 활용 사례를 공유한 경험이 있다.' },
  { id: 20, areaIndex: 5, areaName: '⑤ 성찰과 지속적 계발', text: '나는 학기 종료 후 AI 활동의 운영 결과를 점검하고 개선안을 기록한다.' },
];

export const DEFAULT_RUBRIC_WEIGHTS: Pick<RubricCriterionRow, 'area' | 'weight'>[] = [
  { area: '전공 문제 이해 및 정의', weight: 15 },
  { area: 'AI 활용 전략 및 도구 선정', weight: 15 },
  { area: '과정 투명성 (로그 기록)', weight: 10 },
  { area: '결과 검증 (Fact-Check)', weight: 20 },
  { area: '인간 판단 및 수정/개선', weight: 20 },
  { area: 'AI 윤리 및 데이터 보안', weight: 10 },
  { area: '최종 산출물 완성도', weight: 10 },
];

export interface WizardFormInput {
  // Step 1
  researchType: 'new' | 'cert';
  academicField: AcademicField;
  department: string;
  major: string;
  courseTitleKo: string;
  courseTitleEn: string;
  targetGradeSemester: string;
  courseClassification: '전필' | '전선';
  credits: number;
  theoryHours: number;
  practiceHours: number;
  professorName: string;
  selectedCourseTypes: AiXCourseType[];
  targetCompetencyLevel: CompetencyLevel;

  // Step 2
  existingMajorGoal: string;
  existingCourseLimit: string;
  aiIntegrationIdea: string;

  // Step 3
  facultyScores: number[]; // 길이 20 (각 1~5점)
  scaffoldingNote: string;
  trainingRecords: TrainingRecordRow[];

  // Step 4
  syllabusOutline: string;
  moduleName: string;
  moduleWeeks: string;
  finalDeliverable: string;
  primaryTools: string;

  // Step 5
  rubricWeights: number[]; // 길이 7 (합계 100)
  verificationStandard: string;
  formativeFeedbackType: 'llm_prompt' | 'rag_kb';

  // Step 6
  openSemester: string;
  expectedCapacity: string;
  classroomEnv: string;
  prevCourseName: string;
  nextCourseName: string;
  badgeKeywords: string;
}

export const SAMPLE_WIZARD_INPUT: WizardFormInput = {
  researchType: 'new',
  academicField: '인문사회',
  department: '행정학과',
  major: '공공정책학전공',
  courseTitleKo: '스마트 정책분석과 생성형 AI',
  courseTitleEn: 'Smart Policy Analysis and Generative AI',
  targetGradeSemester: '2학년 2학기',
  courseClassification: '전선',
  credits: 3,
  theoryHours: 2,
  practiceHours: 2,
  professorName: '홍길동',
  selectedCourseTypes: ['활용형', '분석형'],
  targetCompetencyLevel: 'Level 2',

  existingMajorGoal:
    '지역사회 청년 인구 유출 등 주요 공공 정책 쟁점을 파악하고, 전공 정책학 이론을 바탕으로 합리적인 정책 대안을 설계할 수 있다.',
  existingCourseLimit:
    '전통적인 정책 분석 수업에서는 시간적 제약으로 인해 소수의 정형 데이터나 몇 편의 보고서 사례 분석에 머물러, 실제 사회에서 발생하는 방대한 비정형 여론·정책 데이터를 다루지 못함.',
  aiIntegrationIdea:
    '생성형 AI(LLM)를 접목해 수백 건의 지역 정책 원문·민원·뉴스 데이터를 요약·분류하고, AI가 제시한 통계와 대안을 공식 정부 결산서·통계청 자료와 대조 검증(Fact-check)하여 심층 정책 제안서를 작성하게 함.',

  facultyScores: [4, 4, 3, 3, 4, 4, 4, 3, 2, 2, 3, 2, 4, 4, 4, 4, 3, 3, 2, 3],
  scaffoldingNote:
    '전공 선수과목 미이수 학생을 위해 정책학 기초 용어 요약집을 사전 배포하고, AI 초보자를 위해 1~2주차에 프롬프트 기본 가이드와 무료 계정 설정 실습을 진행함.',
  trainingRecords: [
    {
      programName: '2026학년도 AI-X 교과목 설계 AXIS 교수법 워크숍',
      organizer: '경상국립대학교 AI융합원',
      date: '2026.08.20.',
      hours: '4시간',
      participant: '홍길동',
    },
  ],

  syllabusOutline:
    '1주: OT 및 AI 리터러시·사전진단 / 2주: 공공정책 이론과 데이터 / 3주: 문서 탐색과 AI 기초 질의 / 4주: 비정형 정책 텍스트 수집·정제 / 5~6주: [모듈1] 정책 문서 빅데이터 AI 분석 및 통계 대조 검증 / 7주: 중간 성과 발표 / 8주: 정책 대안 도출 이론 / 9~10주: [모듈2] AI 활용 정책 대안 시나리오 설계 및 법·예산 적합성 검토 / 11주: 보고서 초안 작성 / 12~13주: [모듈3] LLM 기반 형성평가 피드백 및 인간 판단 기반 수정 / 14주: 최종 보고서 및 검증표 취합 / 15주: 기말 성과 발표회',
  moduleName: '모듈 ① 정책 문서 빅데이터 분석 및 AI 결과 검증',
  moduleWeeks: '5~6주차 운영 (총 6시간)',
  finalDeliverable: 'AI 기반 지역 공공정책 분석 보고서 (핵심 프롬프트 로그 2개 및 사실 검증표 포함)',
  primaryTools: 'ChatGPT, Claude (무료 대체: Google Gemini, Voyant Tools)',

  rubricWeights: [15, 15, 10, 20, 20, 10, 10],
  verificationStandard: '보건복지부·행정안전부 공식 결산 통계, 국가통계포털(KOSIS), 학술 논문 및 법령 원문',
  formativeFeedbackType: 'llm_prompt',

  openSemester: '2027학년도 2학기 개설 확정 (매년 2학기 정규 개설)',
  expectedCapacity: '35명 내외 (실습 및 밀착 피드백이 가능한 분반 규모 유지)',
  classroomEnv: '단과대학 컴퓨터 실습실 활용 (범용 LLM 무료 계정 기반 웹 브라우저 실습)',
  prevCourseName: 'AI와 컴퓨팅사고 (교양, 1-1)',
  nextCourseName: 'AI 융합 공공정책 캡스톤디자인 (전선, 3-2)',
  badgeKeywords: '#정책분석가 #데이터기반기획 #AI리터러시 #인간책무성',
};