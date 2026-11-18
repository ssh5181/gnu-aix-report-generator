import { NextRequest, NextResponse } from 'next/server';

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

const expectedPasscode = '4877';
    if (!body.passcode || String(body.passcode).trim() !== expectedPasscode.trim()) {
      return NextResponse.json(
        { error: '유효하지 않은 참여 코드입니다. 다시 로그인해 주세요.' },
        { status: 401 }
      );
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ error: '인증 처리 중 오류가 발생했습니다.' }, { status: 400 });
  }
}