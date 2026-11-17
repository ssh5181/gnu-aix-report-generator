import JSZip from 'jszip';
import { AiXReportData } from '@/types/report';

const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

export interface GenerateHwpxOptions {
  templateUrl?: string;
  removeSubmissionGuidePage?: boolean; // 2쪽 '정책보고서 작성 및 제출 요령' 삭제 여부 (기본 true)
}

/**
 * 원본 .hwpx 템플릿을 불러와 작성방법/예시를 제거하고 AI 생성 데이터를 주입한 .hwpx Blob을 반환합니다.
 */
export async function generateAiXReportHwpx(
  data: AiXReportData,
  options: GenerateHwpxOptions = {}
): Promise<Blob> {
  const {
    templateUrl = '/templates/base_template.hwpx',
    removeSubmissionGuidePage = true,
  } = options;

  // 1. 원본 .hwpx 파일 로드 및 압축 해제
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`템플릿 파일을 불러올 수 없습니다: ${templateUrl}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) {
    throw new Error('유효한 .hwpx 파일이 아닙니다 (Contents/section0.xml 누락).');
  }

  const xmlText = await sectionFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('section0.xml 파싱 중 오류가 발생했습니다.');
  }

  // 2. 마스터 템플릿 자동 정제 (작성방법 박스, (예시) 라벨, 선택적 안내 페이지 제거)
  sanitizeTemplate(doc, removeSubmissionGuidePage);

  // 3. 본문 및 표 데이터 주입
  populateCoverAndMeta(doc, data);
  populateExecutiveSummary(doc, data.executiveSummary);
  populateChapter1(doc, data);
  populateChapter2(doc, data);
  populateChapter3AndAppendices(doc, data);

  // 4. XML 직렬화 및 OWPML 표준 ZIP 재압축
  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(doc);

  // OWPML 표준에 따라 mimetype은 압축하지 않고(STORE) 최상위에 유지
  const outZip = new JSZip();
  const mimetypeContent = await zip.file('mimetype')?.async('string');
  if (mimetypeContent) {
    outZip.file('mimetype', mimetypeContent, { compression: 'STORE' });
  }

  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (relativePath === 'mimetype' || file.dir) continue;
    if (relativePath === 'Contents/section0.xml') {
      outZip.file(relativePath, updatedXml, { compression: 'DEFLATE' });
    } else {
      const content = await file.async('uint8array');
      outZip.file(relativePath, content, { compression: 'DEFLATE' });
    }
  }

  return await outZip.generateAsync({
    type: 'blob',
    mimeType: 'application/hwp+zip',
  });
}

/* ============================================================================
 * [A] 마스터 템플릿 정제 로직
 * ========================================================================== */
function sanitizeTemplate(doc: Document, removeGuidePage: boolean) {
  // 1) 모든 【작성 개요 및 목적】, 【작성방법】 회색/파란색 안내 박스 제거
  //    (해당 박스들은 모두 borderFillIDRef="22"인 1x1 테이블로 구성됨)
  const allTables = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));
  for (const tbl of allTables) {
    const firstTc = tbl.getElementsByTagNameNS(HP_NS, 'tc')[0];
    if (firstTc && firstTc.getAttribute('borderFillIDRef') === '22') {
      const parentPara = findAncestor(tbl, 'p');
      if (parentPara && parentPara.parentNode) {
        parentPara.parentNode.removeChild(parentPara);
      }
    }
  }

  // 2) 2쪽 '정책보고서 작성 및 제출 요령' 안내표 제거 옵션
  if (removeGuidePage) {
    const guideTbl = findTableById(doc, '1153757507');
    if (guideTbl) {
      const parentPara = findAncestor(guideTbl, 'p');
      if (parentPara && parentPara.parentNode) {
        parentPara.parentNode.removeChild(parentPara);
      }
    }
  }

  // 3) 모든 표 제목(<hp:caption>)에서 '(예시)' 텍스트 run 제거
  const captions = Array.from(doc.getElementsByTagNameNS(HP_NS, 'caption'));
  for (const cap of captions) {
    const runs = Array.from(cap.getElementsByTagNameNS(HP_NS, 'run'));
    for (const run of runs) {
      const txt = run.textContent || '';
      if (txt.includes('(예시)')) {
        if (txt.trim() === '(예시)') {
          run.parentNode?.removeChild(run);
        } else {
          setRunText(run, txt.replace(/\(예시\)/g, '').trim());
        }
      }
    }
  }
}

/* ============================================================================
 * [B] 표지, 제출문, 요약, 목차 데이터 주입
 * ========================================================================== */
function populateCoverAndMeta(doc: Document, data: AiXReportData) {
  // 1) 표지 상단 제목 박스 (tbl id="1153757599")
  const titleTbl = findTableById(doc, '1153757599');
  if (titleTbl) {
    const runs = Array.from(titleTbl.getElementsByTagNameNS(HP_NS, 'run'));
    for (const run of runs) {
      if ((run.textContent || '').trim() === 'OO') {
        setRunText(run, data.department.replace(/학부\(과\)$|학과$|학부$/, ''));
      }
    }
    clearLineSegArrays(titleTbl);
  }

  // 2) 표지 하단 메타 표 (tbl id="1153757600")
  const coverMetaTbl = findTableById(doc, '1153757600');
  if (coverMetaTbl) {
    const rows = getDirectRows(coverMetaTbl);
    // Row 0 Col 1: ( 교 과 목 명 )
    if (rows[0]) {
      const tc = getRowCells(rows[0])[1];
      const paras = Array.from(tc.getElementsByTagNameNS(HP_NS, 'p'));
      if (paras[1]) {
        setParagraphSingleText(doc, paras[1], `(${data.courseTitleKo})`, '116');
      }
    }
    // Row 1 Col 1: 신규 개발 / 기존 인증 체크박스
    if (rows[1]) {
      const tc = getRowCells(rows[1])[1];
      const paras = Array.from(tc.getElementsByTagNameNS(HP_NS, 'p'));
      const newMark = data.researchType === 'new' ? '☑' : '☐';
      const certMark = data.researchType === 'cert' ? '☑' : '☐';
      if (paras[0]) setParagraphSingleText(doc, paras[0], ` ${newMark} AI-X 교과목 신규 개발`, '116');
      if (paras[1]) setParagraphSingleText(doc, paras[1], ` ${certMark} 기존 AI-X 교과목 인증`, '116');
    }
    // Row 2 Col 1: 연구책임자
    if (rows[2]) {
      const tc = getRowCells(rows[2])[1];
      setCellLines(doc, tc, [data.professorName], '34', '17');
    }
  }

  // 3) 3쪽 제출문 글상자 (rect id="1153757509")
  const allRects = Array.from(doc.getElementsByTagNameNS(HP_NS, 'rect'));
  const submitRect = allRects.find((r) => r.getAttribute('id') === '1153757509');
  if (submitRect) {
    const runs = Array.from(submitRect.getElementsByTagNameNS(HP_NS, 'run'));
    for (const run of runs) {
      const txt = run.textContent || '';
      if (txt.includes('연 구 과 제 명')) {
        setRunText(run, data.projectTitle || `${data.courseTitleKo} AI-X 교과목 개발 및 인증 연구`);
      } else if (txt.includes('20 년 월')) {
        setRunText(run, data.submissionMonth);
      } else if (txt.includes('〇 〇 〇')) {
        setRunText(run, data.professorName);
      }
    }
    clearLineSegArrays(submitRect);
  }

  // 4) 목차 및 Ⅱ장 대제목의 '과목명가칭' 치환
  const allRuns = Array.from(doc.getElementsByTagNameNS(HP_NS, 'run'));
  for (const run of allRuns) {
    const txt = (run.textContent || '').trim();
    if (txt === '과목명') {
      setRunText(run, data.courseTitleKo);
    } else if (txt === '가칭') {
      setRunText(run, '');
    }
  }
}

function populateExecutiveSummary(doc: Document, summaryParagraphs: string[]) {
  // '요 약' 컨테이너(id="1153757512") 다음 문단들을 찾아 요약 본문 삽입
  const containers = Array.from(doc.getElementsByTagNameNS(HP_NS, 'container'));
  const summaryHeader = containers.find((c) => c.getAttribute('id') === '1153757512');
  if (!summaryHeader) return;

  const headerPara = findAncestor(summaryHeader, 'p');
  if (!headerPara || !headerPara.parentNode) return;

  // 요약 페이지의 빈 문단들을 정리하고 새 문단 삽입
  let cursor = headerPara.nextSibling;
  const emptyParas: Element[] = [];
  while (cursor) {
    if (cursor.nodeType === 1 && (cursor as Element).localName === 'p') {
      const pEl = cursor as Element;
      if (pEl.getAttribute('pageBreak') === '1') break; // 목차 페이지 도달 시 중단
      emptyParas.push(pEl);
    }
    cursor = cursor.nextSibling;
  }

  const insertBeforeNode = emptyParas[0] || cursor;
  for (const line of summaryParagraphs) {
    const p = createParagraph(doc, line, '52', '28'); // 본문 휴먼명조 11pt
    headerPara.parentNode.insertBefore(p, insertBeforeNode);
  }

  // 기존 빈 줄 일부만 남기고 제거
  emptyParas.slice(2).forEach((p) => p.parentNode?.removeChild(p));
}

/* ============================================================================
 * [C] Ⅰ장 테이블 주입 ([표 Ⅰ-1], [표 Ⅰ-2])
 * ========================================================================== */
function populateChapter1(doc: Document, data: AiXReportData) {
  // [표 Ⅰ-1] 배경 및 추진 목적 요약 (tbl id="1178815043")
  const t1_1 = findTableById(doc, '1178815043');
  if (t1_1) {
    const rows = getDirectRows(t1_1);
    if (rows[1]) {
      const cells = getRowCells(rows[1]);
      setCellLines(doc, cells[1], data.table1_1.envProblem, '61', '24');
      setCellLines(doc, cells[2], data.table1_1.envSolution, '61', '24');
    }
    if (rows[2]) {
      const cells = getRowCells(rows[2]);
      setCellLines(doc, cells[1], data.table1_1.deptProblem, '61', '24');
      setCellLines(doc, cells[2], data.table1_1.deptSolution, '61', '24');
    }
    if (rows[3]) {
      const cells = getRowCells(rows[3]);
      setCellLines(doc, cells[1], data.table1_1.goalProblem, '61', '24');
      setCellLines(doc, cells[2], data.table1_1.goalSolution, '61', '24');
    }
  }

  // [표 Ⅰ-2] 학과 AI 융합 교육과정 로드맵 (tbl id="1178815045")
  // 구조: 헤더 2행(row 0~1), 데이터는 2행씩 병합된 구조(row 2~3, 4~5, 6~7, 8~9)
  const t1_2 = findTableById(doc, '1178815045');
  if (t1_2 && data.roadmapRows.length > 0) {
    const rows = getDirectRows(t1_2);
    const dataPairs = [
      [rows[2], rows[3]],
      [rows[4], rows[5]],
      [rows[6], rows[7]],
      [rows[8], rows[9]],
    ];

    data.roadmapRows.forEach((item, idx) => {
      if (idx >= dataPairs.length) return;
      const [topRow, bottomRow] = dataPairs[idx];
      if (!topRow || !bottomRow) return;

      const topCells = getRowCells(topRow);
      const bottomCells = getRowCells(bottomRow);

      setCellLines(doc, topCells[0], [item.stage], '31', '21');
      setCellLines(doc, topCells[1], [item.courseName], '31', '24');
      setCellLines(doc, topCells[2], [item.category], '31', '24');
      setCellLines(doc, bottomCells[0], [item.creditInfo], '31', '24');
      setCellLines(doc, topCells[3], [item.yearSemester], '31', '24');
      setCellLines(doc, topCells[4], [item.targetLevel], '31', '24');
      setCellLines(doc, topCells[5], item.contents, '61', '21');
    });
  }
}

/* ============================================================================
 * [D] Ⅱ장 테이블 주입 (Ⅱ-1 ~ Ⅱ-5)
 * ========================================================================== */
function populateChapter2(doc: Document, data: AiXReportData) {
  // [표 Ⅱ-1.1] 교과목 기본 정보 및 AI-X 유형 진단표 (tbl id="1171751083")
  const t2_1_1 = findTableById(doc, '1171751083');
  if (t2_1_1) {
    const rows = getDirectRows(t2_1_1);
    // Row 1: 교과목명 (국문/영문)
    if (rows[1]) {
      const cells = getRowCells(rows[1]);
      setCellLines(doc, cells[1], [data.courseTitleKo, data.courseTitleEn], '31', '24');
    }
    // Row 3: 학년/학기, 이수구분, 학점, 이론, 실습
    if (rows[3]) {
      const cells = getRowCells(rows[3]);
      setCellLines(doc, cells[0], [data.targetGradeSemester], '31', '24');
      const reqChk = data.courseClassification === '전필' ? '☑ 전필  ☐ 전선' : '☐ 전필  ☑ 전선';
      setCellLines(doc, cells[1], [reqChk], '31', '98');
      setCellLines(doc, cells[2], [String(data.credits)], '31', '24');
      setCellLines(doc, cells[3], [String(data.theoryHours)], '31', '98');
      setCellLines(doc, cells[4], [String(data.practiceHours)], '31', '98');
    }
    // Row 5: 담당교원 성명, 소속
    if (rows[5]) {
      const cells = getRowCells(rows[5]);
      setCellLines(doc, cells[0], [data.professorName], '31', '24');
      setCellLines(doc, cells[1], [`${data.department} ${data.major}`.trim()], '31', '24');
    }
    // Row 6: AI-X 4대 유형 체크박스
    if (rows[6]) {
      const cells = getRowCells(rows[6]);
      const types: Array<AiXReportData['selectedCourseTypes'][number]> = [
        '이해형',
        '활용형',
        '분석형',
        '창작·설계형',
      ];
      const labels = ['AI 이해형', 'AI 활용형', 'AI 분석형', 'AI 창작·설계형'];
      types.forEach((t, idx) => {
        const mark = data.selectedCourseTypes.includes(t) ? '☑' : '☐';
        if (cells[idx + 1]) {
          setCellLines(doc, cells[idx + 1], [`${mark} ${labels[idx]}`], '31', '24');
        }
      });
    }
    // Row 7: 유형 진단 근거
    if (rows[7]) {
      const cells = getRowCells(rows[7]);
      setCellLines(doc, cells[1], data.typeDiagnosisRationale, '68', '24');
    }
  }

  // [표 Ⅱ-1.2] 전공 문제 정의 및 연계 모델 매핑 (tbl id="1178815051")
  const t2_1_2 = findTableById(doc, '1178815051');
  if (t2_1_2) {
    const rows = getDirectRows(t2_1_2);
    if (rows[1]) {
      const tc = getRowCells(rows[1])[1];
      setCellLines(
        doc,
        tc,
        [
          `[기존 한계] ${data.table2_1_2.existingLimit}`,
          `[AI 도입 필요성] ${data.table2_1_2.aiNecessity}`,
        ],
        '64',
        '24'
      );
    }
    if (rows[2]) {
      const tc = getRowCells(rows[2])[1];
      const modelLines = data.table2_1_2.linkageModels.map(
        (m) => `☑ ${m.modelName}: ${m.description}`
      );
      setCellLines(doc, tc, modelLines, '64', '24');
    }
  }

  // [표 Ⅱ-1.3] 교육목표 정렬 및 통합 학습성과 (tbl id="1178815055")
  const t2_1_3 = findTableById(doc, '1178815055');
  if (t2_1_3) {
    const rows = getDirectRows(t2_1_3);
    if (rows[1]) setCellLines(doc, getRowCells(rows[1])[1], [data.table2_1_3.majorObjective], '64', '24');
    if (rows[2]) setCellLines(doc, getRowCells(rows[2])[1], [data.table2_1_3.subordinatedAiObjective], '64', '24');
    if (rows[3]) setCellLines(doc, getRowCells(rows[3])[1], [data.table2_1_3.integratedLearningOutcome], '64', '24');
  }

  // [표 Ⅱ-1.4] 5대 최소 요건 자체점검 (tbl id="1178815059")
  const t2_1_4 = findTableById(doc, '1178815059');
  if (t2_1_4) {
    const rows = getDirectRows(t2_1_4);
    const reqs = [
      data.table2_1_4_requirements.majorCentric,
      data.table2_1_4_requirements.aiIntegration,
      data.table2_1_4_requirements.studentAgency,
      data.table2_1_4_requirements.ethics,
      data.table2_1_4_requirements.evaluability,
    ];
    reqs.forEach((text, idx) => {
      if (rows[idx + 1]) {
        const cells = getRowCells(rows[idx + 1]);
        setCellLines(doc, cells[2], ['충족'], '31', '24');
        setCellLines(doc, cells[3], [text], '66', '24');
      }
    });
  }

  // [표 Ⅱ-2.1] 1주차 학생 진입 수준 진단 비계 계획 (tbl id="1178815065")
  const t2_2_1 = findTableById(doc, '1178815065');
  if (t2_2_1) {
    const rows = getDirectRows(t2_2_1);
    const plans = [
      data.scaffoldingPlans.q1Plan,
      data.scaffoldingPlans.q2Plan,
      data.scaffoldingPlans.q3Plan,
      data.scaffoldingPlans.q4Plan,
    ];
    plans.forEach((planLines, idx) => {
      if (rows[idx + 1]) {
        setCellLines(doc, getRowCells(rows[idx + 1])[4], planLines, '61', '24');
      }
    });
  }

  // [표 Ⅱ-2.2] 담당 교원 AI 교수역량 자가진단 결과 (tbl id="1178815069")
  const t2_2_2 = findTableById(doc, '1178815069');
  if (t2_2_2) {
    const rows = getDirectRows(t2_2_2);
    const areas = [
      data.facultyCompetency.area1,
      data.facultyCompetency.area2,
      data.facultyCompetency.area3,
      data.facultyCompetency.area4,
      data.facultyCompetency.area5,
    ];
    areas.forEach((area, idx) => {
      if (rows[idx + 1]) {
        const cells = getRowCells(rows[idx + 1]);
        setCellLines(doc, cells[2], [area.score.toFixed(1)], '31', '24');
        const stageLines = [
          `${area.stage === 'Acquire' ? '☑' : '☐'} Acquire`,
          `${area.stage === 'Deepen' ? '☑' : '☐'} Deepen`,
          `${area.stage === 'Create' ? '☑' : '☐'} Create`,
        ];
        setCellLines(doc, cells[3], stageLines, '66', '24');
        setCellLines(doc, cells[4], area.plans, '61', '24');
      }
    });
    // Row 6: 종합
    if (rows[6]) {
      const cells = getRowCells(rows[6]);
      const stageKoMap = { Acquire: '(기초 단계)', Deepen: '(심화 단계)', Create: '(확장 단계)' };
      setCellLines(doc, cells[2], [data.facultyCompetency.overallScore.toFixed(2)], '31', '24');
      setCellLines(
        doc,
        cells[3],
        [data.facultyCompetency.overallStage, stageKoMap[data.facultyCompetency.overallStage]],
        '66',
        '24'
      );
      setCellLines(doc, cells[4], [data.facultyCompetency.overallPlan], '61', '24');
    }
  }

  // [표 Ⅱ-3.1] 15주 주차별 수업운영 계획 (tbl id="1178815076")
  const t2_3_1 = findTableById(doc, '1178815076');
  if (t2_3_1) {
    const rows = getDirectRows(t2_3_1);
    data.weeklyPlans.forEach((wp) => {
      const targetRow = rows[wp.week];
      if (!targetRow) return;
      const cells = getRowCells(targetRow);
      // 제목(진하게 charPrIDRef="81") + 세부내용(일반 charPrIDRef="24") 혼합 구성
      clearElementChildren(getSubList(cells[1]));
      const subList = getSubList(cells[1]);
      subList.appendChild(createParagraph(doc, wp.title, '66', '81'));
      for (const detail of wp.details) {
        subList.appendChild(createParagraph(doc, detail, '61', '24'));
      }
      setCellLines(doc, cells[2], [wp.method], '31', '24');
      setCellLines(doc, cells[3], wp.equipment.split(',').map((s) => s.trim()), '31', '24');
      setCellLines(doc, cells[4], [wp.note], '31', '24');
    });
  }

  // [표 Ⅱ-3.2] 완결형 AI-X 모듈 상세 설계서 (캡션으로 탐색)
  const t2_3_2 = findTableByCaption(doc, 'Ⅱ-3.2');
  if (t2_3_2) {
    const rows = getDirectRows(t2_3_2);
    if (rows[1]) {
      setCellLines(doc, getRowCells(rows[1])[1], [data.moduleDesign.moduleName], '61', '24');
      setCellLines(doc, getRowCells(rows[1])[2], [data.moduleDesign.moduleScheduleNote], '31', '24');
    }
    const modFields = [
      data.moduleDesign.majorGoal,
      data.moduleDesign.aiGoal,
      data.moduleDesign.tools,
      data.moduleDesign.procedures,
      data.moduleDesign.deliverables,
      data.moduleDesign.usageRules,
    ];
    modFields.forEach((lines, idx) => {
      if (rows[idx + 2]) {
        setCellLines(doc, getRowCells(rows[idx + 2])[1], lines, '61', '24');
      }
    });
  }

  // [표 Ⅱ-3.3] 수업 기능 중심 AI 도구 선정 및 안전성 (가변 행 지원)
  const t2_3_3 = findTableByCaption(doc, 'Ⅱ-3.3');
  if (t2_3_3 && data.aiToolSafetyRows.length > 0) {
    syncDynamicRows(doc, t2_3_3, 1, data.aiToolSafetyRows.length, (rowEl, idx) => {
      const item = data.aiToolSafetyRows[idx];
      const cells = getRowCells(rowEl);
      setCellLines(doc, cells[0], [item.functionName], '31', '24');
      setCellLines(doc, cells[1], [item.primaryTool], '31', '24');
      setCellLines(doc, cells[2], [item.freeAlternative], '31', '24');
      setCellLines(doc, cells[3], item.activities, '61', '24');
      setCellLines(doc, cells[4], item.safetyMeasures, '61', '24');
    });
  }

  // [표 Ⅱ-4.1] 다차원 평가 루브릭
  const t2_4_1 = findTableByCaption(doc, 'Ⅱ-4.1');
  if (t2_4_1) {
    const rows = getDirectRows(t2_4_1);
    data.rubricRows.forEach((r, idx) => {
      if (rows[idx + 1]) {
        const cells = getRowCells(rows[idx + 1]);
        setCellLines(doc, cells[0], [r.area], '31', '27');
        setCellLines(doc, cells[1], [String(r.weight)], '31', '24');
        setCellLines(doc, cells[2], [r.level4], '61', '24');
        setCellLines(doc, cells[3], [r.level3], '61', '24');
        setCellLines(doc, cells[4], [r.level2], '61', '24');
        setCellLines(doc, cells[5], [r.level1], '61', '24');
      }
    });
  }

  // [표 Ⅱ-4.2] 학생 제출용 과정 증빙 서식 내 결과 검증표 예시 커스터마이징
  const t2_4_2 = findTableByCaption(doc, 'Ⅱ-4.2');
  if (t2_4_2) {
    // 내부 중첩 테이블 중 결과 검증표 행 채우기
    const nestedTables = Array.from(t2_4_2.getElementsByTagNameNS(HP_NS, 'tbl'));
    if (nestedTables[1]) {
      const vRows = getDirectRows(nestedTables[1]);
      if (vRows[1]) {
        const cells = getRowCells(vRows[1]);
        setCellLines(doc, cells[0], [data.evidenceFormExample.aiClaimExample], '31', '24');
        setCellLines(doc, cells[1], [data.evidenceFormExample.verificationResultExample], '31', '24');
        setCellLines(doc, cells[2], [data.evidenceFormExample.evidenceSourceExample], '31', '24');
        setCellLines(doc, cells[3], [data.evidenceFormExample.actionExample], '31', '24');
      }
    }
  }

  // [표 Ⅱ-4.3] 형성평가 프롬프트 템플릿
  const t2_4_3 = findTableByCaption(doc, 'Ⅱ-4.3');
  if (t2_4_3) {
    const rows = getDirectRows(t2_4_3);
    const prompts = [
      data.formativePrompts.rubricCheckPrompt,
      data.formativePrompts.factCheckPrompt,
      data.formativePrompts.reflectionPrompt,
    ];
    prompts.forEach((pText, idx) => {
      if (rows[idx + 1]) {
        setCellLines(doc, getRowCells(rows[idx + 1])[1], [pText], '61', '24');
      }
    });
  }

  // [표 Ⅱ-5.1] 디지털 배지 연계 정보
  const t2_5_1 = findTableByCaption(doc, 'Ⅱ-5.1');
  if (t2_5_1) {
    fillDigitalBadgeTable(doc, t2_5_1, data.digitalBadge);
  }

  // [표 Ⅱ-5.2] 2027학년도 정규 교육과정 개설 및 학사 운영 계획
  const t2_5_2 = findTableByCaption(doc, 'Ⅱ-5.2');
  if (t2_5_2) {
    const rows = getDirectRows(t2_5_2);
    const planGroups = [
      data.openingPlan2027.semester,
      data.openingPlan2027.targetAndCapacity,
      data.openingPlan2027.environment,
      data.openingPlan2027.curriculumLinkage,
      data.openingPlan2027.cqiPlan,
    ];
    planGroups.forEach((lines, idx) => {
      if (rows[idx + 1]) {
        setCellLines(doc, getRowCells(rows[idx + 1])[1], lines, '61', '24');
      }
    });
  }
}

/* ============================================================================
 * [E] Ⅲ(Ⅳ)장 결론 및 부록 데이터 주입
 * ========================================================================== */
function populateChapter3AndAppendices(doc: Document, data: AiXReportData) {
  // [표 Ⅳ-1] AI-X 교과목 개발 연구 핵심 성과 총괄
  const t4_1 = findTableByCaption(doc, 'Ⅳ-1');
  if (t4_1) {
    const rows = getDirectRows(t4_1);
    const totalHours = data.theoryHours + data.practiceHours;
    if (rows[1]) {
      setCellLines(
        doc,
        getRowCells(rows[1])[1],
        [`${data.courseTitleKo} (${data.credits}학점/${totalHours}시수)`],
        '31',
        '24'
      );
    }
    if (rows[2]) setCellLines(doc, getRowCells(rows[2])[1], [`${data.professorName} 교수`], '31', '24');
    if (rows[3]) {
      setCellLines(
        doc,
        getRowCells(rows[3])[1],
        [data.selectedCourseTypes.map((t) => `AI ${t}`).join(' + ')],
        '31',
        '24'
      );
    }
    if (rows[4]) setCellLines(doc, getRowCells(rows[4])[1], [data.targetCompetencyLevel], '31', '24');
    if (rows[5]) setCellLines(doc, getRowCells(rows[5])[1], data.conclusionSummary.moduleSummary, '61', '24');
    if (rows[6]) {
      setCellLines(
        doc,
        getRowCells(rows[6])[1],
        [
          `과정/검증/인간판단 배점: ${data.conclusionSummary.humanAccountabilityWeight}점`,
          `최종 산출물 완성도: ${data.conclusionSummary.finalProductWeight}점`,
        ],
        '61',
        '24'
      );
    }
    if (rows[7]) setCellLines(doc, getRowCells(rows[7])[1], [data.digitalBadge.badgeName], '31', '24');
    if (rows[8]) {
      setCellLines(
        doc,
        getRowCells(rows[8])[1],
        [`${data.openingPlan2027.semester[0] || ''} (${data.targetGradeSemester} 대상)`],
        '31',
        '24'
      );
    }
  }

  // [표 Ⅳ-2] 3대 영역 기대효과 및 향후 발전 방향
  const t4_2 = findTableByCaption(doc, 'Ⅳ-2');
  if (t4_2) {
    const rows = getDirectRows(t4_2);
    if (rows[1]) {
      const cells = getRowCells(rows[1]);
      setCellLines(doc, cells[1], data.expectedEffects.studentEffects, '61', '24');
      setCellLines(doc, cells[2], data.expectedEffects.studentKpis, '61', '24');
    }
    if (rows[2]) {
      const cells = getRowCells(rows[2]);
      setCellLines(doc, cells[1], data.expectedEffects.deptEffects, '61', '24');
      setCellLines(doc, cells[2], data.expectedEffects.deptKpis, '61', '24');
    }
  }

  // <부록 3> 이수 실적 목록표 (가변 행)
  const allTables = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));
  const trainingTbl = allTables.find((t) => (t.textContent || '').includes('주관/주최기관'));
  if (trainingTbl && data.trainingRecords.length > 0) {
    syncDynamicRows(doc, trainingTbl, 1, data.trainingRecords.length, (rowEl, idx) => {
      const rec = data.trainingRecords[idx];
      const cells = getRowCells(rowEl);
      setCellLines(doc, cells[0], [String(idx + 1)], '31', '24');
      setCellLines(doc, cells[1], [rec.programName], '31', '24');
      setCellLines(doc, cells[2], [rec.organizer], '31', '24');
      setCellLines(doc, cells[3], [rec.date], '31', '24');
      setCellLines(doc, cells[4], [rec.hours], '31', '24');
      setCellLines(doc, cells[5], [rec.participant || data.professorName], '31', '24');
    });
  }

// <부록 4> 디지털 배지 상세정보 서식 (본문 [표 Ⅱ-5.1]과 자동 동기화)
  const t2_5_1 = findTableByCaption(doc, 'Ⅱ-5.1');
  const badgeAppendixTbl = allTables.find(
    (t) =>
      (t.textContent || '').includes('배지명') &&
      (t.textContent || '').includes('지식/기술') &&
      t !== t2_5_1
  );  if (badgeAppendixTbl) {
    fillDigitalBadgeTable(doc, badgeAppendixTbl, data.digitalBadge);
  }
}

/* ============================================================================
 * [F] XML DOM 유틸리티 함수
 * ========================================================================== */
function fillDigitalBadgeTable(
  doc: Document,
  tbl: Element,
  badge: AiXReportData['digitalBadge']
) {
  const rows = getDirectRows(tbl);
  if (rows[1]) setCellLines(doc, getRowCells(rows[1])[1], [badge.badgeName], '61', '24');
  if (rows[2]) setCellLines(doc, getRowCells(rows[2])[1], [badge.badgeDescription], '61', '24');
  if (rows[3]) setCellLines(doc, getRowCells(rows[3])[1], badge.acquisitionCriteria, '61', '24');
  if (rows[4]) setCellLines(doc, getRowCells(rows[4])[1], [badge.keywords.join(' ')], '61', '24');
}

function findTableById(doc: Document, id: string): Element | undefined {
  return Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl')).find(
    (t) => t.getAttribute('id') === id
  );
}

function findTableByCaption(doc: Document, keyword: string): Element | undefined {
  return Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl')).find((t) => {
    const cap = t.getElementsByTagNameNS(HP_NS, 'caption')[0];
    return cap && (cap.textContent || '').includes(keyword);
  });
}

function getDirectRows(tbl: Element): Element[] {
  return Array.from(tbl.children).filter((el) => el.localName === 'tr');
}

function getRowCells(tr: Element): Element[] {
  return Array.from(tr.children).filter((el) => el.localName === 'tc');
}

function getSubList(tc: Element): Element {
  return tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
}

function setCellLines(
  doc: Document,
  tc: Element | undefined,
  lines: string[],
  paraPrIDRef = '61',
  charPrIDRef = '24'
) {
  if (!tc) return;
  const subList = getSubList(tc);
  if (!subList) return;

  clearElementChildren(subList);
  const safeLines = lines.length > 0 ? lines : [''];
  for (const line of safeLines) {
    subList.appendChild(createParagraph(doc, line, paraPrIDRef, charPrIDRef));
  }
}

function setParagraphSingleText(
  doc: Document,
  pEl: Element,
  text: string,
  charPrIDRef: string
) {
  clearElementChildren(pEl);
  const run = doc.createElementNS(HP_NS, 'hp:run');
  run.setAttribute('charPrIDRef', charPrIDRef);
  const t = doc.createElementNS(HP_NS, 'hp:t');
  t.appendChild(doc.createTextNode(text));
  run.appendChild(t);
  pEl.appendChild(run);
}

function createParagraph(
  doc: Document,
  text: string,
  paraPrIDRef: string,
  charPrIDRef: string
): Element {
  const p = doc.createElementNS(HP_NS, 'hp:p');
  p.setAttribute('id', '2147483648');
  p.setAttribute('paraPrIDRef', paraPrIDRef);
  p.setAttribute('styleIDRef', '0');
  p.setAttribute('pageBreak', '0');
  p.setAttribute('columnBreak', '0');
  p.setAttribute('merged', '0');

  const run = doc.createElementNS(HP_NS, 'hp:run');
  run.setAttribute('charPrIDRef', charPrIDRef);

  const t = doc.createElementNS(HP_NS, 'hp:t');
  t.appendChild(doc.createTextNode(text));

  run.appendChild(t);
  p.appendChild(run);
  // 주의: <hp:linesegarray>를 의도적으로 생성하지 않음 -> 한글 프로그램이 열 때 줄바꿈 및 표 높이를 자동 재계산함
  return p;
}

function syncDynamicRows(
  doc: Document,
  tbl: Element,
  templateRowIdx: number,
  targetCount: number,
  populateFn: (rowEl: Element, index: number) => void
) {
  const rows = getDirectRows(tbl);
  const templateRow = rows[templateRowIdx];
  if (!templateRow) return;

  // 기존 데이터 행 정리 후 필요한 개수만큼 복제
  for (let i = rows.length - 1; i > templateRowIdx; i--) {
    tbl.removeChild(rows[i]);
  }
  for (let i = 1; i < targetCount; i++) {
    const cloned = templateRow.cloneNode(true) as Element;
    tbl.appendChild(cloned);
  }

  const updatedRows = getDirectRows(tbl);
  for (let i = 0; i < targetCount; i++) {
    populateFn(updatedRows[templateRowIdx + i], i);
  }
}

function setRunText(run: Element, text: string) {
  const existingT = run.getElementsByTagNameNS(HP_NS, 't')[0];
  if (existingT) {
    clearElementChildren(existingT);
    existingT.appendChild(run.ownerDocument!.createTextNode(text));
  }
}

function clearLineSegArrays(root: Element) {
  const segs = Array.from(root.getElementsByTagNameNS(HP_NS, 'linesegarray'));
  for (const seg of segs) {
    seg.parentNode?.removeChild(seg);
  }
}

function clearElementChildren(el: Element) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function findAncestor(el: Element, localName: string): Element | null {
  let curr: Node | null = el.parentNode;
  while (curr) {
    if (curr.nodeType === 1 && (curr as Element).localName === localName) {
      return curr as Element;
    }
    curr = curr.parentNode;
  }
  return null;
}