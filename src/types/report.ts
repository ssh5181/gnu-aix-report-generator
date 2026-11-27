export type AiXCourseType = '이해형' | '활용형' | '분석형' | '창작·설계형';
export type CompetencyLevel = 'Level 1' | 'Level 2' | 'Level 3';
export type FacultyStage = 'Acquire' | 'Deepen' | 'Create';

export interface RoadmapRow {
  stage: string;           // 예: 'AI 기초 이해', 'AI 전공 적용', 'AX 창작·융합', 'AX 진로·확장'
  courseName: string;      // 교과목명
  category: string;        // 예: '교양', '전선', '전필', '마이크로디그리'
  creditInfo: string;      // 예: '2-1-2', '3-2-2', '12학점 이수'
  yearSemester: string;    // 예: '1-1', '2-2', '3-2'
  targetLevel: string;     // 예: 'Level 1', 'Level 2', 'Level 3', 'Level 3+'
  contents: string[];      // 주요 교육 내용 (개조식 줄 배열)
}

export interface FacultyCompetencyArea {
  score: number;           // 영역 평균 (1.0 ~ 5.0)
  stage: FacultyStage;     // 자동 판정 (1.0~2.4 Acquire, 2.5~3.9 Deepen, 4.0~5.0 Create)
  plans: string[];         // 역량 계발 및 지원 계획 (개조식 줄 배열)
}

export interface WeeklyPlanRow {
  week: number;            // 1 ~ 15
  title: string;           // 주차 핵심 주제
  details: string[];       // 세부 강의 내용 (2~3줄)
  method: string;          // 예: '강의/실습', '실습/토론'
  equipment: string;       // 예: 'LLM, 태블릿PC 등'
  note: string;            // 예: 'AI 모듈 ① (Level 2)', '일반 수업'
}

export interface AiToolSafetyRow {
  functionName: string;    // 예: '개념 이해 및 자료 탐색'
  primaryTool: string;     // 대표 활용 도구
  freeAlternative: string; // 무료 대체 도구
  activities: string[];    // 적용 학습 활동
  safetyMeasures: string[];// 데이터 보안 및 윤리적 안전 조치사항
}

export interface RubricCriterionRow {
  area: string;            // 평가영역명
  weight: number;          // 배점(%)
  level4: string;          // 우수(4점)
  level3: string;          // 보통(3점)
  level2: string;          // 미흡(2점)
  level1: string;          // 부적절(1점)
}

export interface TrainingRecordRow {
  programName: string;
  organizer: string;
  date: string;
  hours: string;
  participant: string;
}

export interface ModuleDesign {
  moduleName: string;                    // 예: '모듈 ① 정책 문서 빅데이터 분석 및 AI 결과 검증'
  moduleScheduleNote: string;            // 예: '5~6주차 운영 (총 6시간)'
  majorGoal: string[];                   // ① 전공목표
  aiGoal: string[];                      // ② AI활용목표
  tools: string[];                       // ③ 도구 (주 도구 + 무료 대체 도구)
  procedures: string[];                  // ④ 활동절차 (차시별)
  deliverables: string[];                // ⑤ 산출물
  usageRules: string[];                  // ⑥ 사용규칙
}

export interface AiXReportData {
  // 1. 기본 메타정보 (표지, 제출문, 목차, Ⅱ-1.1 동기화)
  researchType: 'new' | 'cert';          // 신규 개발 vs 기존 인증
  department: string;                    // 예: '행정학과' (표지 'OO학부(과)'에 매핑)
  major: string;                         // 예: '공공정책학전공'
  courseTitleKo: string;                 // 교과목명(국문)
  courseTitleEn: string;                 // 교과목명(영문)
  projectTitle: string;                  // 연구과제명 (제출문용)
  professorName: string;                 // 연구책임자 성명
  submissionMonth: string;               // 예: '2026년 11월'
  targetGradeSemester: string;           // 예: '2학년 2학기'
  courseClassification: '전필' | '전선';
  credits: number;
  theoryHours: number;
  practiceHours: number;

  // 2. 요약 (4쪽)
  executiveSummary: string[];            // 4~6문단 내외 연구 요약

  // 3. Ⅰ장: 총괄 개요 및 학과 AI 이수 체계
  table1_1: {
    envProblem: string[];                // 전공·산업계 환경 변화 - 현황 및 문제점
    envSolution: string[];               // 전공·산업계 환경 변화 - 해결 방향
    deptProblem: string[];               // 학과 교육 현황 및 한계 - 문제점
    deptSolution: string[];              // 학과 교육 현황 및 한계 - 해결 방향
    goalProblem: string[];               // 연구 개발 목표 - 핵심 목표
    goalSolution: string[];              // 연구 개발 목표 - 세부 달성 방향
  };
  roadmapRows: RoadmapRow[];             // [표 Ⅰ-2] 4단계 로드맵

  // 4. Ⅱ-1장: 교과목 개요 및 전공-AI 연계 설계
  selectedCourseTypes: AiXCourseType[];  // 1~2개 선택
  typeDiagnosisRationale: string[];      // 유형 진단 근거 (2~3문단)
  targetCompetencyLevel: CompetencyLevel;
  table2_1_2: {
    existingLimit: string;               // [기존 한계]
    aiNecessity: string;                 // [AI 도입 필요성]
    linkageModels: {
      modelName: string;                 // 예: '데이터 확장 모델 (Data Expansion Model)'
      description: string;
    }[];
  };
  table2_1_3: {
    majorObjective: string;
    subordinatedAiObjective: string;
    integratedLearningOutcome: string;
  };
  table2_1_4_requirements: {
    majorCentric: string;                // ① 전공성
    aiIntegration: string;               // ② AI통합성
    studentAgency: string;               // ③ 학생수행성
    ethics: string;                      // ④ 윤리성
    evaluability: string;                // ⑤ 평가가능성
  };

  // 5. Ⅱ-2장: 학생 진입 수준 진단 및 교원 역량 계발
  scaffoldingPlans: {
    q1Plan: string[];                    // AI 사용 경험 유무 대응
    q2Plan: string[];                    // 선수과목 수강 여부 대응
    q3Plan: string[];                    // 환각 검증 경험 유무 대응
    q4Plan: string[];                    // 산출물 제작 경험 유무 대응
  };
  facultyCompetency: {
    area1: FacultyCompetencyArea;        // ① AI 기초 이해
    area2: FacultyCompetencyArea;        // ② 전공-AI 융합 설계
    area3: FacultyCompetencyArea;        // ③ 수업 운영 및 학습자 지원
    area4: FacultyCompetencyArea;        // ④ AI 윤리 및 학문적 정직성
    area5: FacultyCompetencyArea;        // ⑤ 성찰과 지속적 계발
    overallScore: number;
    overallStage: FacultyStage;
    overallPlan: string;
  };

  // 6. Ⅱ-3장: 완결형 AI-X 모듈 및 주차별 수업 설계
  weeklyPlans: WeeklyPlanRow[];          // 15주 전체
  moduleDesign: ModuleDesign;           // [표 Ⅱ-3.2] 대표 모듈
  additionalModuleDesigns?: ModuleDesign[]; // 추가 모듈 ([표 Ⅱ-3.2]를 복제해 이어서 수록)
  aiToolSafetyRows: AiToolSafetyRow[];   // [표 Ⅱ-3.3]

  // 7. Ⅱ-4장: 지능형 다차원 평가 및 피드백 체계
  rubricRows: RubricCriterionRow[];      // 7개 영역 루브릭
  evidenceFormExample: {
    taskExampleTitle: string;
    aiClaimExample: string;
    verificationResultExample: string;
    evidenceSourceExample: string;
    actionExample: string;
  };
  formativePrompts: {
    rubricCheckPrompt: string;
    factCheckPrompt: string;
    reflectionPrompt: string;
  };

  // 8. Ⅱ-5장 & 부록 4: 성과 가치화 및 2027학년도 개설 계획
  digitalBadge: {
    badgeName: string;
    badgeDescription: string;
    acquisitionCriteria: string[];
    keywords: string[];
  };
  openingPlan2027: {
    semester: string[];                  // 정규 개설 학기
    targetAndCapacity: string[];         // 수강 대상 및 정원
    environment: string[];               // 강의 및 실습 환경
    curriculumLinkage: string[];         // 교육과정 연계 및 확장 계획
    cqiPlan: string[];                   // 학기 말 CQI 및 품질 환류
  };

  // 9. Ⅲ(Ⅳ)장: 결론 및 기대효과
  conclusionSummary: {
    moduleSummary: string[];             // 핵심 완결형 모듈(시간) 요약
    humanAccountabilityWeight: number;   // 과정+검증+인간판단 배점 합계
    finalProductWeight: number;          // 최종 산출물 완성도 배점
  };
  expectedEffects: {
    studentEffects: string[];
    studentKpis: string[];
    deptEffects: string[];
    deptKpis: string[];
  };

  // 10. 부록 3: 연수 이수 실적
  trainingRecords: TrainingRecordRow[];
}