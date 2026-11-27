import JSZip from 'jszip';
import { AiXReportData, ModuleDesign } from '@/types/report';

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

  // 1. 수정된 템플릿이 즉시 반영되도록 캐시를 무시하고 로드
  const response = await fetch(templateUrl, { cache: 'no-store' });
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

  // 2. 마스터 템플릿 정제 (작성방법 박스 및 (예시) 라벨 제거)
  sanitizeTemplate(doc, removeSubmissionGuidePage);

  // 3. 본문, 목차, 표 데이터 주입
  populateCoverAndMeta(doc, data);
  populateExecutiveSummary(doc, data.executiveSummary);
  populateChapter1(doc, data);
  populateChapter2(doc, data);
  populateChapter3AndAppendices(doc, data);

  // 4. XML 직렬화 (OWPML 표준 XML 선언부 보존) 및 ZIP 재압축
  const serializer = new XMLSerializer();
  let updatedXml = serializer.serializeToString(doc);
  if (!updatedXml.startsWith('<?xml')) {
    updatedXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + updatedXml;
  }

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
 * [A] 마스터 템플릿 정제 (사용자 지정 표 위치 속성은 보존)
 * ========================================================================== */
function sanitizeTemplate(doc: Document, removeGuidePage: boolean) {
  const allTables = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));

  for (const tbl of allTables) {
    const firstTc = tbl.getElementsByTagNameNS(HP_NS, 'tc')[0];
    // 1) 모든 【작성 개요 및 목적】, 【작성방법】 안내 박스(borderFillIDRef="22") 제거
    //    [표 Ⅱ-4.2] 학생 제출용 서식처럼 같은 테두리 스타일을 쓰는 실제 서식 표는 보존하기 위해
    //    '【'로 시작하는 안내 박스만 삭제함
    if (
      firstTc &&
      firstTc.getAttribute('borderFillIDRef') === '22' &&
      (tbl.textContent || '').trim().startsWith('【')
    ) {
      const parentPara = findAncestor(tbl, 'p');
      if (parentPara && parentPara.parentNode) {
        parentPara.parentNode.removeChild(parentPara);
      }
      continue;
    }

    // 2) 다중 페이지 표 분할이 막히지 않도록 pageBreak="TABLE" 및 noAdjust="1"만 해제
    if (tbl.getAttribute('pageBreak') === 'TABLE') {
      tbl.setAttribute('pageBreak', 'CELL');
    }
    if (tbl.getAttribute('noAdjust') === '1') {
      tbl.setAttribute('noAdjust', '0');
    }

    // 표를 감싸는 부모 문단의 구버전 줄 높이 캐시 제거
    const parentPara = findAncestor(tbl, 'p');
    if (parentPara) {
      const directSegs = Array.from(parentPara.children).filter(
        (el) => el.localName === 'linesegarray'
      );
      directSegs.forEach((seg) => parentPara.removeChild(seg));
    }
  }

  // 3) 2쪽 '정책보고서 작성 및 제출 요령' 안내표 제거 옵션
  if (removeGuidePage) {
    const guideTbl =
      findTableById(doc, '1153757507') ||
      allTables.find((t) => (t.textContent || '').includes('정책보고서 작성 및 제출 요령'));
    if (guideTbl) {
      const parentPara = findAncestor(guideTbl, 'p');
      if (parentPara && parentPara.parentNode) {
        parentPara.parentNode.removeChild(parentPara);
      }
    }
  }

  // 4) 캡션 밖 별도 문단으로 놓인 '(예시)' 라벨 run 제거 (예: [표 Ⅱ-4.2] 제목 옆)
  for (const run of Array.from(doc.getElementsByTagNameNS(HP_NS, 'run'))) {
    if ((run.textContent || '').trim() === '(예시)') {
      run.parentNode?.removeChild(run);
    }
  }

  // 5) 모든 표 제목(<hp:caption>)에서 '(예시)' 텍스트 run 제거
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
  const allTables = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));

  const titleTbl =
    findTableById(doc, '1153757599') ||
    allTables.find((t) => (t.textContent || '').includes('개발 및 인증 연구 결과보고서'));
  if (titleTbl) {
    const runs = Array.from(titleTbl.getElementsByTagNameNS(HP_NS, 'run'));
    for (const run of runs) {
      if ((run.textContent || '').trim() === 'OO') {
        setRunText(run, data.department.replace(/학부\(과\)$|학과$|학부$/, ''));
      }
    }
    clearLineSegArrays(titleTbl);
  }

  const coverMetaTbl =
    findTableById(doc, '1153757600') ||
    allTables.find(
      (t) =>
        (t.textContent || '').includes('프로그램명') &&
        (t.textContent || '').includes('연구책임자')
    );
  if (coverMetaTbl) {
    const rows = getDirectRows(coverMetaTbl);
    if (rows[0]) {
      const tc = getRowCells(rows[0])[1];
      const paras = Array.from(tc.getElementsByTagNameNS(HP_NS, 'p'));
      if (paras[1]) {
        setParagraphSingleText(doc, paras[1], `(${data.courseTitleKo})`, '116');
      }
    }
    if (rows[1]) {
      const tc = getRowCells(rows[1])[1];
      const paras = Array.from(tc.getElementsByTagNameNS(HP_NS, 'p'));
      const newMark = data.researchType === 'new' ? '☑' : '☐';
      const certMark = data.researchType === 'cert' ? '☑' : '☐';
      if (paras[0]) setParagraphSingleText(doc, paras[0], ` ${newMark} AI-X 교과목 신규 개발`, '116');
      if (paras[1]) setParagraphSingleText(doc, paras[1], ` ${certMark} 기존 AI-X 교과목 인증`, '116');
    }
    if (rows[2]) {
      const tc = getRowCells(rows[2])[1];
      setCellLines(doc, tc, [data.professorName], '34', '17');
    }
  }

  const allRects = Array.from(doc.getElementsByTagNameNS(HP_NS, 'rect'));
  const submitRect =
    allRects.find((r) => r.getAttribute('id') === '1153757509') ||
    allRects.find((r) => (r.textContent || '').includes('연 구 과 제 명'));
  if (submitRect) {
    // run 안에 표(연구책임자 칸)가 중첩되어 있으므로 run이 아닌 <hp:t> 단위로 정확히 치환함
    const texts = Array.from(submitRect.getElementsByTagNameNS(HP_NS, 't'));
    for (const t of texts) {
      const txt = (t.textContent || '').trim();
      if (txt === '연 구 과 제 명') {
        setTText(t, data.projectTitle || `${data.courseTitleKo} AI-X 교과목 개발 및 인증 연구`);
      } else if (/^20\s*년\s*월$/.test(txt)) {
        setTText(t, data.submissionMonth);
      } else if (txt === '〇 〇 〇') {
        setTText(t, data.professorName);
      }
    }
    clearLineSegArrays(submitRect);
  }

  // 부록 2 자문의견서 수신처 '○○학과장' 치환
  const deptName = data.department.trim();
  if (deptName) {
    for (const t of Array.from(doc.getElementsByTagNameNS(HP_NS, 't'))) {
      const txt = t.textContent || '';
      if (txt.includes('○○학과장')) {
        setTText(t, txt.replace('○○학과장', `${deptName}장`));
      }
    }
  }

  // 목차 및 Ⅱ장 대제목의 '과목명가칭' 치환 + 목차 점선(tab) 너비 자동 보정
  const allRuns = Array.from(doc.getElementsByTagNameNS(HP_NS, 'run'));
  for (const run of allRuns) {
    const txt = (run.textContent || '').trim();
    if (txt === '과목명') {
      setRunText(run, data.courseTitleKo);
      // 파란색 예시 표시(charPrIDRef="96")를 제목 본연의 검정 굵은 글씨(charPrIDRef="18")로 통일
      if (run.getAttribute('charPrIDRef') === '96') {
        run.setAttribute('charPrIDRef', '18');
      }

      const parentPara = findAncestor(run, 'p');
      if (parentPara) {
        clearLineSegArrays(parentPara);
        // 목차 줄인 경우(<hp:tab> 포함), 교과목명 길이에 맞춰 점선 탭 너비 재계산
        const tabEl = parentPara.getElementsByTagNameNS(HP_NS, 'tab')[0];
        if (tabEl) {
          const fullHeadingText = `Ⅱ. ${data.courseTitleKo} AI-X 교과목 개발`;
          const textWidthHwpUnit = estimateHwpTextWidth(fullHeadingText, 1500);
          const pageNumWidth = 1800; // 우측 페이지 번호 여백
          const totalLineWidth = 48188; // 본문 가로 폭(HWPUNIT)
          const newTabWidth = Math.max(2000, totalLineWidth - textWidthHwpUnit - pageNumWidth);
          tabEl.setAttribute('width', String(Math.round(newTabWidth)));
        }
      }
    } else if (txt === '가칭') {
      run.parentNode?.removeChild(run);
    }
  }
}

function estimateHwpTextWidth(text: string, fullWidthUnit = 1500): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code > 255) {
      width += fullWidthUnit;
    } else {
      width += fullWidthUnit * 0.52;
    }
  }
  return width;
}

function populateExecutiveSummary(doc: Document, summaryParagraphs: string[]) {
  const containers = Array.from(doc.getElementsByTagNameNS(HP_NS, 'container'));
  const summaryHeader =
    containers.find((c) => c.getAttribute('id') === '1153757512') ||
    containers.find((c) => (c.textContent || '').replace(/\s+/g, '') === '요약');
  if (!summaryHeader) return;

  const headerPara = findAncestor(summaryHeader, 'p');
  if (!headerPara || !headerPara.parentNode) return;

  let cursor = headerPara.nextSibling;
  const emptyParas: Element[] = [];
  while (cursor) {
    if (cursor.nodeType === 1 && (cursor as Element).localName === 'p') {
      const pEl = cursor as Element;
      if (pEl.getAttribute('pageBreak') === '1') break;
      emptyParas.push(pEl);
    }
    cursor = cursor.nextSibling;
  }

  const insertBeforeNode = emptyParas[0] || cursor;
  for (const line of summaryParagraphs) {
    const p = createParagraph(doc, line, '52', '28');
    headerPara.parentNode.insertBefore(p, insertBeforeNode);
  }

  emptyParas.slice(2).forEach((p) => p.parentNode?.removeChild(p));
}

/* ============================================================================
 * [C] Ⅰ장 테이블 주입 ([표 Ⅰ-1], [표 Ⅰ-2])
 * ========================================================================== */
function populateChapter1(doc: Document, data: AiXReportData) {
  const t1_1 = findTableByIdOrCaption(doc, '1178815043', 'Ⅰ-1');
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

  const t1_2 = findTableByIdOrCaption(doc, '1178815045', 'Ⅰ-2');
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
  const t2_1_1 = findTableByIdOrCaption(doc, '1171751083', 'Ⅱ-1.1');
  if (t2_1_1) {
    const rows = getDirectRows(t2_1_1);
    if (rows[1]) {
      const cells = getRowCells(rows[1]);
      setCellLines(doc, cells[1], [data.courseTitleKo, data.courseTitleEn], '31', '24');
    }
    if (rows[3]) {
      const cells = getRowCells(rows[3]);
      setCellLines(doc, cells[0], [data.targetGradeSemester], '31', '24');
      const reqChk = data.courseClassification === '전필' ? '☑ 전필  ☐ 전선' : '☐ 전필  ☑ 전선';
      setCellLines(doc, cells[1], [reqChk], '31', '98');
      setCellLines(doc, cells[2], [String(data.credits)], '31', '24');
      setCellLines(doc, cells[3], [String(data.theoryHours)], '31', '98');
      setCellLines(doc, cells[4], [String(data.practiceHours)], '31', '98');
    }
    if (rows[5]) {
      const cells = getRowCells(rows[5]);
      setCellLines(doc, cells[0], [data.professorName], '31', '24');
      setCellLines(doc, cells[1], [`${data.department} ${data.major}`.trim()], '31', '24');
    }
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
    if (rows[7]) {
      const cells = getRowCells(rows[7]);
      setCellLines(doc, cells[1], data.typeDiagnosisRationale, '68', '24');
    }
  }

  const t2_1_2 = findTableByIdOrCaption(doc, '1178815051', 'Ⅱ-1.2');
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

  const t2_1_3 = findTableByIdOrCaption(doc, '1178815055', 'Ⅱ-1.3');
  if (t2_1_3) {
    const rows = getDirectRows(t2_1_3);
    if (rows[1]) setCellLines(doc, getRowCells(rows[1])[1], [data.table2_1_3.majorObjective], '64', '24');
    if (rows[2]) setCellLines(doc, getRowCells(rows[2])[1], [data.table2_1_3.subordinatedAiObjective], '64', '24');
    if (rows[3]) setCellLines(doc, getRowCells(rows[3])[1], [data.table2_1_3.integratedLearningOutcome], '64', '24');
  }

  const t2_1_4 = findTableByIdOrCaption(doc, '1178815059', 'Ⅱ-1.4');
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

  const t2_2_1 = findTableByIdOrCaption(doc, '1178815065', 'Ⅱ-2.1');
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

  const t2_2_2 = findTableByIdOrCaption(doc, '1178815069', 'Ⅱ-2.2');
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

  const t2_3_1 = findTableByIdOrCaption(doc, '1178815076', 'Ⅱ-3.1');
  if (t2_3_1) {
    const rows = getDirectRows(t2_3_1);
    data.weeklyPlans.forEach((wp) => {
      const targetRow = rows[wp.week];
      if (!targetRow) return;
      const cells = getRowCells(targetRow);
      const subList = getSubList(cells[1]);
      if (subList) {
        clearElementChildren(subList);
        subList.appendChild(createParagraph(doc, wp.title, '66', '81'));
        for (const detail of wp.details) {
          subList.appendChild(createParagraph(doc, detail, '61', '24'));
        }
      }
      setCellLines(doc, cells[2], [wp.method], '31', '24');
      setCellLines(doc, cells[3], wp.equipment.split(',').map((s) => s.trim()), '31', '24');
      setCellLines(doc, cells[4], [wp.note], '31', '24');
    });
  }

  const t2_3_2 = findTableByCaption(doc, 'Ⅱ-3.2');
  if (t2_3_2) {
    const extraModules = data.additionalModuleDesigns ?? [];
    // 추가 모듈이 있으면 [표 Ⅱ-3.2]를 모듈 수만큼 복제해 대표 모듈 표 바로 뒤에 이어 붙임
    // (값을 채우기 전에 복제해야 원본 서식이 그대로 복사됨)
    const tables: Element[] = [t2_3_2];
    const anchorPara = findAncestor(t2_3_2, 'p');
    if (extraModules.length > 0 && anchorPara?.parentNode) {
      let insertAfter: Element = anchorPara;
      extraModules.forEach((_, i) => {
        const clonedPara = anchorPara.cloneNode(true) as Element;
        const clonedTbl = clonedPara.getElementsByTagNameNS(HP_NS, 'tbl')[0];
        if (!clonedTbl) return;
        // 표 ID 중복을 피하기 위해 새 ID 부여
        const baseId = Number(t2_3_2.getAttribute('id')) || 1178815081;
        clonedTbl.setAttribute('id', String(baseId + 1000 + i));
        anchorPara.parentNode!.insertBefore(clonedPara, insertAfter.nextSibling);
        insertAfter = clonedPara;
        tables.push(clonedTbl);
      });
      // 표 제목에 모듈 번호 표기
      tables.forEach((tbl, i) => appendCaptionText(tbl, ` (모듈 ${i + 1})`));
    }

    const designs = [data.moduleDesign, ...extraModules];
    tables.forEach((tbl, i) => fillModuleDesignTable(doc, tbl, designs[i]));
  }

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

  // [표 Ⅱ-4.2] 학생 제출용 서식: 제목이 표 캡션이 아닌 별도 문단이므로 표 ID 또는 본문 문구로 찾음
  const t2_4_2 =
    findTableById(doc, '1178815098') ||
    Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl')).find((t) =>
      (t.textContent || '').includes('과정 및 검증 보고서(학생 제출용)')
    );
  if (t2_4_2) {
    // 1행 1열 표라 '나누지 않음'(NONE)·'쪽 영역 안으로 제한'(flowWithText=1)이면 쪽 끝에서 잘림.
    // OWPML pageBreak: TABLE=표는 나뉘되 셀은 안 나뉨, CELL=셀 안의 내용도 나뉨, NONE=안 나뉨.
    // 셀이 하나뿐이므로 셀 내용이 다음 쪽으로 이어지도록 CELL로 설정하고 쪽 영역 제한을 해제함.
    t2_4_2.setAttribute('pageBreak', 'CELL');
    const pos = Array.from(t2_4_2.children).find((el) => el.localName === 'pos');
    if (pos) pos.setAttribute('flowWithText', '0');
    clearLineSegArrays(t2_4_2);

    const ex = data.evidenceFormExample;
    // 과제명 예시
    for (const t of Array.from(t2_4_2.getElementsByTagNameNS(HP_NS, 't'))) {
      if ((t.textContent || '').trim() === '☐ 과제명:' && ex.taskExampleTitle) {
        setTText(t, `☐ 과제명: ${ex.taskExampleTitle}`);
        break;
      }
    }
    // 결과 검증표(Fact-checking Table) 예시 행
    const verifyTbl = Array.from(t2_4_2.getElementsByTagNameNS(HP_NS, 'tbl')).find((t) =>
      (t.textContent || '').includes('확인 근거')
    );
    if (verifyTbl) {
      const vRows = getDirectRows(verifyTbl);
      if (vRows[1]) {
        const cells = getRowCells(vRows[1]);
        setCellLines(doc, cells[0], [ex.aiClaimExample], '31', '24');
        setCellLines(doc, cells[1], [ex.verificationResultExample], '31', '24');
        setCellLines(doc, cells[2], [ex.evidenceSourceExample], '31', '24');
        setCellLines(doc, cells[3], [ex.actionExample], '31', '24');
      }
    }
  }

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

  const t2_5_1 = findTableByCaption(doc, 'Ⅱ-5.1');
  if (t2_5_1) {
    fillDigitalBadgeTable(doc, t2_5_1, data.digitalBadge);
  }

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

  const t2_5_1 = findTableByCaption(doc, 'Ⅱ-5.1');
  const badgeAppendixTbl = allTables.find(
    (t) =>
      (t.textContent || '').includes('배지명') &&
      (t.textContent || '').includes('지식/기술') &&
      t !== t2_5_1
  );
  if (badgeAppendixTbl) {
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

function fillModuleDesignTable(doc: Document, tbl: Element, design: ModuleDesign) {
  const rows = getDirectRows(tbl);
  if (rows[1]) {
    setCellLines(doc, getRowCells(rows[1])[1], [design.moduleName], '61', '24');
    setCellLines(doc, getRowCells(rows[1])[2], [design.moduleScheduleNote], '31', '24');
  }
  const modFields = [
    design.majorGoal,
    design.aiGoal,
    design.tools,
    design.procedures,
    design.deliverables,
    design.usageRules,
  ];
  modFields.forEach((lines, idx) => {
    if (rows[idx + 2]) {
      setCellLines(doc, getRowCells(rows[idx + 2])[1], lines ?? [], '61', '24');
    }
  });
}

function appendCaptionText(tbl: Element, suffix: string) {
  const cap = Array.from(tbl.children).find((el) => el.localName === 'caption');
  if (!cap) return;
  const texts = Array.from(cap.getElementsByTagNameNS(HP_NS, 't'));
  const last = texts[texts.length - 1];
  if (last) setTText(last, `${(last.textContent || '').replace(/\s+$/, '')}${suffix}`);
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

function findTableByIdOrCaption(
  doc: Document,
  id: string,
  captionKeyword: string
): Element | undefined {
  return findTableById(doc, id) || findTableByCaption(doc, captionKeyword);
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

  for (let i = rows.length - 1; i > templateRowIdx; i--) {
    tbl.removeChild(rows[i]);
  }
  for (let i = 1; i < targetCount; i++) {
    const cloned = templateRow.cloneNode(true) as Element;
    tbl.appendChild(cloned);
  }

  const updatedRows = getDirectRows(tbl);
  tbl.setAttribute('rowCnt', String(updatedRows.length));
  updatedRows.forEach((tr, rIdx) => {
    const cells = getRowCells(tr);
    cells.forEach((tc) => {
      const cellAddr = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
      if (cellAddr) {
        cellAddr.setAttribute('rowAddr', String(rIdx));
      }
    });
  });

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

function setTText(t: Element, text: string) {
  clearElementChildren(t);
  t.appendChild(t.ownerDocument!.createTextNode(text));
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