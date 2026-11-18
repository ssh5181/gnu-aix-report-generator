import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const received = String(body?.passcode ?? '');

    if (received.trim() !== '4877') {
      return NextResponse.json(
        { error: `[진단] 서버가 받은 입력값: "${received}" / 기대값: "4877"` },
        { status: 401 }
      );
    }

    return NextResponse.json({ authenticated: true });
  } catch (e) {
    return NextResponse.json({ error: `요청 파싱 실패: ${String(e)}` }, { status: 400 });
  }
}