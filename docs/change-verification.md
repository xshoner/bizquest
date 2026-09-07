# 수정 사항 및 검증

## 팀 구성 잠금

- 팀 구성이 완료되면 학생 대기실에는 자기 팀만 표시되고 선택 버튼은 비활성화됩니다.
- 완료된 팀의 이름·마스코트·구호도 학생에게 읽기 전용입니다.
- Firestore 규칙에서 완료된 팀의 이동·탈퇴·추가 참여와 잠금 해제를 차단합니다.
- 방 소유자인 관리자는 기존 관리자 화면에서 팀 배정과 정보를 수정할 수 있습니다.
- 신규 학생은 미배정 상태로만 생성할 수 있어 생성 요청으로 잠금을 우회할 수 없습니다.

## AI 평가

- 브라우저 → 같은 도메인의 `/api/ai-evaluation` → Firestore 인증·사업계획 조회 → Google Gemini 순으로 처리합니다.
- 모델은 서버에서 `gemini-2.5-flash`로 고정합니다.
- API 키는 Cloudflare Pages의 `GEMINI_API_KEY` 서버 바인딩을 사용합니다. 클라이언트에 키를 넣지 않습니다.
- 오류 안내와 평가 완료 메시지는 Gemini로 통일했습니다.
- 테스트는 Google API 주소·모델·키 헤더·Cloudflare 함수 연결·인증 거부·잘못된 JSON·대체 평가·투자 집계를 확인합니다. 네트워크 응답을 모의하므로 운영 API 키의 유효성을 증명하지는 않습니다.

## 화면

- 자가진단 결과: CEO·CTO·CFO·CPO·CMO·CSO·COO 영문 명칭과 한국어 역할 설명.
- 관리자 투자 카드 및 결과 보고서: 기본자산·투자유치·총액.
- 학생: 실시간 확정 투자금 및 시뮬레이션/결과 단계의 최종 투자유치 자산.
- 이벤트 적용 전 자산 현황: 짙은 회색. 적용 후 상승/하락: 붉은색/파란색 배경의 반복 화살표.

## 검증 명령

```sh
npm ci
node server/aiEvaluationHandler.test.mjs
npm run build
```

팀 잠금 보안 규칙은 `demo-bizquest` 로컬 Firestore 에뮬레이터에서 별도로 검증했습니다.

## 운영 반영

Cloudflare Pages에는 저장소 전체를 연결하고 `npm run build`, 출력 디렉터리 `dist`를 사용해야 합니다. 루트 `functions` 디렉터리의 서버 함수도 함께 배포해야 하며, 정적 `dist` 파일만 업로드하면 이 함수가 포함되지 않습니다.

Firestore 규칙은 Pages 배포와 별도로 반영해야 합니다.

```sh
npx firebase deploy --only firestore:rules --project startup-5ec16
```

운영 확인은 교사 로그인 후 제출한 사업계획을 평가하여 응답의 `source: gemini`, `evaluation.model: gemini-2.5-flash` 및 14개 평가 지표를 확인합니다. 인증 없는 요청의 401 응답만으로 Gemini 평가 성공 여부를 판단할 수 없습니다.
