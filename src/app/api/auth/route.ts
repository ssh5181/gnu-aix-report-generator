import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { passcode } = await req.json();

    if (!passcode || String(passcode).trim() !== '4877') {
      return NextResponse.json(
        { error: '입장 코드가 일치하지 않습니다. 교육혁신처 안내 메일의 참여 코드를 확인해 주세요.' },
        { status: 401 }
      );
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ error: '인증 처리 중 오류가 발생했습니다.' }, { status: 400 });
  }
}