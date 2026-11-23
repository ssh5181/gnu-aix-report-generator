# 경상국립대학교 AI-X 교과목 개발·인증 결과보고서 생성기

교수자가 입력한 교과목 정보를 바탕으로 Gemini가 결과보고서 초안을 만들고, 대학 표준 서식(`public/templates/base_template.hwpx`)에 채워 `.hwpx` 파일로 내려받는 Next.js 웹앱입니다.

## 환경변수 (필수)

배포 환경(예: Vercel → Settings → Environment Variables)과 로컬 `.env.local`에 아래 두 값을 설정합니다. 형식은 `.env.example`을 참고하세요.

| 이름 | 설명 |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API 키 |
| `ACCESS_PASSCODE` | 참여 교원 입장 코드. 소스 코드에 두지 않습니다. 설정하지 않으면 입장이 막힙니다. |

## 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.
