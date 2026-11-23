/**
 * 참여 교원 입장 코드 검증 (서버 전용)
 * 입장 코드는 소스에 두지 않고 배포 환경변수 ACCESS_PASSCODE 로만 설정함
 */
export type PasscodeCheck =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string };

export function checkPasscode(body: Record<string, unknown>): PasscodeCheck {
  const expected = (process.env.ACCESS_PASSCODE || '').trim();
  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: '서버에 입장 코드(ACCESS_PASSCODE)가 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    };
  }
  const rawCode = body.passcode ?? body.password ?? body.code ?? body.accessCode ?? '';
  if (String(rawCode).trim() !== expected) {
    return {
      ok: false,
      status: 401,
      error: '입장 코드가 일치하지 않습니다. 교육혁신처에서 안내받은 참여 코드를 확인해 주세요.',
    };
  }
  return { ok: true };
}
