// 화면 이해: 사진 + 목표 → 구조화된 화면 정보(JSON)
import { chat, parseJsonLoose } from './air.js';
import { normalizeScreen, SCREEN_TYPES, ELEMENT_KINDS } from './screen.js';
export { normalizeScreen, SCREEN_TYPES, ELEMENT_KINDS };

const SYSTEM = `너는 어르신의 키오스크 주문을 돕는 눈이다. 사진 속 키오스크 화면을 보고 JSON 하나만 출력한다. 설명 문장, 코드블록, 생각 과정은 쓰지 않는다.

좌표는 사진 전체 기준 0~1000 정수 [x1,y1,x2,y2] (왼쪽 위가 0,0).
출력 형식:
{"kiosk":true,"quality":"ok","screen":[x1,y1,x2,y2],"type":"menu","title":"화면 제목 원문","els":[{"id":1,"t":"쓰인 글자 그대로","r":"한글 읽기","k":"btn","b":[x1,y1,x2,y2],"p":4500}],"total":null,"no":null,"pick":1,"why":"짧은 이유","say":"쉬운 말 상황 설명 한 문장","mean":"고른 버튼 뜻을 쉬운 말로, 없으면 null","conf":0.9}

규칙:
- kiosk: 사진에 키오스크/주문 화면이 보이면 true.
- quality: ok | far(너무 멀어 글자가 작음) | blur(흔들림) | dark | glare(빛 반사로 가림) | partial(화면이 잘림).
- screen: 키오스크 디스플레이(빛나는 화면) 영역.
- type: start(시작/첫 화면) dine(포장·매장 고르기) menu(메뉴 목록) option(온도·크기·추가 고르기) upsell(세트·추가 구매 권유 창) cart(담은 것 확인) point(적립·멤버십) pay_method(결제 수단 고르기) pay_card(카드 넣기/대기) done(주문 완료) ad(광고 화면) other.
- els: 목표에 필요한 것 위주로 최대 10개. 화면에 실제로 보이는 것만. 없는 버튼을 지어내지 않는다.
  t는 화면 글자를 그대로(영어면 영어 그대로), r은 그 글자를 한국어로 소리 나는 대로(예: ICE→아이스, Take out→테이크아웃). 한글이면 r은 t와 같게.
  k: btn 일반 버튼 | tab 분류 탭 | item 메뉴 상품 | close 닫기(X) | yes 예/확인 | no 아니요/괜찮아요 | skip 건너뛰기/적립 안 함 | next 다음/주문하기 | back 이전 | pay 결제하기 | cancel 취소 | staff 직원 호출 | plus 수량+ | minus 수량-.
  p: 가격이 보이면 숫자(원), 아니면 생략.
- total: 합계 금액이 보이면 숫자. no: 완료 화면의 주문 번호가 보이면 숫자.
- pick: 목표를 이루려면 지금 눌러야 할 els의 id 하나. 권유·광고 창이면 거절(no/close)을 고른다. 목표가 이미 담겼으면 다음 단계(next/pay)로. 모르면 null.
- say: 이 화면이 무엇인지 쉬운 우리말 한 문장(8어절 이하). 위치·색은 말하지 않는다. 외래어 대신 쉬운 말(테이크아웃→가지고 가기, 결제→돈 내기, 옵션→고르는 것, 세트→묶음, 적립→점수 모으기).
- conf: pick이 맞을 확신 0~1.`;

function userPrompt({ goal, history, profile }) {
  const g = goal ? JSON.stringify(goal) : '{"모름":true}';
  const h = (history || []).slice(-4).map((x) => `${x.type || '?'}에서 '${x.target || '-'}' 누름`).join(' → ') || '처음';
  const prefs = [];
  if (profile?.skipPoints !== false) prefs.push('적립·멤버십·쿠폰은 건너뜀');
  return `목표: ${g}\n지금까지: ${h}\n선호: ${prefs.join(', ') || '없음'}\n이 사진의 화면 JSON:`;
}

export async function understand({ imageDataUrl, goal, history, profile, override }) {
  const r = await chat({
    kind: 'vision',
    override,
    maxTokens: 900,
    temperature: 0,
    timeoutMs: 45000,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: userPrompt({ goal, history, profile }) },
        ],
      },
    ],
  });
  let raw;
  try { raw = parseJsonLoose(r.text); } catch (e) {
    const err = new Error('화면 JSON 해석 실패'); err.modelText = r.text; throw err;
  }
  return { screen: normalizeScreen(raw), ms: r.ms, usage: r.usage, model: r.model, rawText: r.text };
}
