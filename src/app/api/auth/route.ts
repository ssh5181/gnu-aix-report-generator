import { NextRequest, NextResponse } from 'next/server';
import { checkPasscode } from '@/lib/passcode';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const check = checkPasscode(body ?? {});
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ error: '인증 처리 중 오류가 발생했습니다.' }, { status: 400 });
  }
}
