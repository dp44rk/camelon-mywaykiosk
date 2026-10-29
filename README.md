<div align="center">

# 내 방식 QR

**어르신 키오스크 길잡이** — 아무 키오스크나 폰으로 비추면, 쉬운 말로 한 단계씩

[서비스 소개](https://dp44rk.github.io/myway/) · [시연 해보기](https://dp44rk.github.io/myway/demo.html) · [폰 앱](https://dp44rk.github.io/myway/app/)

<img src="docs/img/mockup-phone-flow.png" width="720" alt="폰 화면 세 개: 내 방식 정하기, 누를 곳 안내, 결제 금액 확인">

**팀 Camelon** · 박도연 · 여지원 · 윤진영<br>
2026 AI 라이프 솔루션 챌린지 출품작 (원안: AI 라이프 아이디어 챌린지 5번 「내 방식 QR: 범용 접근성 프로필 패스」)

</div>

---

> "화면 오른쪽 가운데에 주황색 네모가 있어요. 영어로 '테이크 아웃'이라고 써 있어요. 가지고 가기라는 뜻이에요. 그걸 누르세요."

이어폰으로 들리는 실제 안내 문장이에요. 위치·색은 AI가 아니라 규칙 코드로 계산해서 매번 같고, 지어내지 않아요.

- 설계: [docs/SPEC.md](docs/SPEC.md) · 평가: [docs/EVAL.md](docs/EVAL.md)

## 두 가지 모드

<img src="docs/img/mockup-kiosk-convert.png" width="640" alt="원래 키오스크 화면과 AI 화면 변환 결과">


| | 카메라 모드 | 연동 모드 |
|---|---|---|
| 쓰는 곳 | **지금 있는 아무 키오스크** | 「내 방식 QR」 배지가 있는 키오스크 |
| 화면 이해 | 폰 사진 → 비전 모델(Air API, Qwen3.8-27B)이 버튼·좌표·화면 종류를 JSON으로 | 키오스크가 자기 화면 구조를 직접 알려 줌 (정확도 100%, AI 비용 0) |
| 키오스크 화면 | 그대로 | **AI 화면 변환**: 쉬운 말 라벨·묶음·큰 버튼 화면으로 다시 그림 (누르면 원래 버튼과 같음) |
| 폰 | 누를 때마다 "찍기" | 내려놓아도 화면이 바뀌면 자동 안내 |

두 모드 모두 **같은 안내 엔진**(`server/lib/engine.js`)을 씁니다. 모델은 "무엇이 보이는지"만 말하고, 결제 확인·권유 거절·위치와 색 말하기·쉬운 말 검사는 규칙 코드가 정합니다.

## 실행 (맥)

```fish
cd ~/Desktop/myqr
npm install
cp .env.example .env      # AIR_API_KEY 넣기 (모델 카드 "코드 보기"의 endpoint/model id 확인)
npm start                 # http://localhost:8787
```

폰 카메라는 HTTPS에서만 켜집니다. 다른 터미널에서:

```fish
brew install cloudflared  # 처음 한 번
npm run tunnel            # https://xxxx.trycloudflare.com 주소가 나옴
```

- 소개 페이지: `https://xxxx.trycloudflare.com/`
- 폰 앱: `https://xxxx.trycloudflare.com/app/` (처음이면 "내 방식 정하기"부터)
- 키오스크(태블릿·노트북): `https://xxxx.trycloudflare.com/kiosk/cafe.html` 또는 `restaurant.html`
- GitHub Pages의 폰 앱에서 실시간 서버를 쓰려면: `https://dp44rk.github.io/myway/app/?api=https://xxxx.trycloudflare.com`

`AIR_API_KEY`가 없으면 연동 모드만 동작합니다 (`/api/health`의 `mock: true`).

### 시연 페이지 음성 미리 녹음 (Qwen3-TTS)

GitHub Pages 시연은 서버가 없어서, 안내 문장을 Qwen3-TTS로 미리 녹음해 `public/voice/`에 둡니다. 녹음이 없는 문장만 폰 내장 음성으로 말해요.

```fish
npm start                                  # 다른 터미널에서
node scripts/collect-utterances.cjs        # 시연에서 나오는 안내 문장 모으기 → public/voice/texts.json
node scripts/prerender-tts.mjs             # 문장 단위로 녹음 → public/voice/*.mp3, index.json (약 130문장, 2.5천 자)
```

## 구조

```
server/            Node 중계 서버 (의존성: jpeg-js) — API 키 보관, 정적 파일 제공
  lib/engine.js    한 단계 안내 핵심 (브라우저·서버 공용)
  lib/guide.js     규칙 플래너(안전장치) + 말 만들기
  lib/layout.js    9칸 위치, 같은 칸 순서, 픽셀/CSS 색 이름
  lib/plain.js     쉬운 말 사전·검사기·지표 (국립국어원 2024 고령층 키오스크 쉬운 언어 예시 반영)
  lib/vision.js    사진 → 화면 JSON (Air API 비전 모델)
  lib/goal*.js     "아이스 아메리카노 하나 가져갈 거야" → 주문 구조 + 되묻기
  lib/convert.js   AI 화면 변환 설계 검증·보정 + 규칙 변환 (브라우저·서버 공용)
  lib/hub.js       연동 모드: 키오스크 ↔ 폰 (롱폴링)
public/            소개 페이지(index.html) + 시연 페이지(demo.html)
  app/             폰 앱 (PWA)
kiosk/             목업 카페·식당 키오스크 (가상 매장, 목업 결제)
eval/              성능 평가 스크립트
test/              단위 테스트 + E2E (Playwright)
```

## 테스트

```fish
npm test                                   # 단위 테스트
node test/e2e-phone.cjs                    # 서버 켠 상태에서: 폰 안내대로 키오스크를 눌러 주문 끝까지
node scripts/build-pages.mjs && npx http-server dist   # 시연 페이지 묶음
```

## 오픈소스

- [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0) — 사진 속 키오스크 QR 인식
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) — 프로필·키오스크 QR
- [jpeg-js](https://github.com/jpeg-js/jpeg-js) (BSD-3) — 버튼 색 계산
- [SUIT](https://sun.fo/suit/) (OFL-1.1) — 글꼴
- [anime.js](https://github.com/juliangarnier/anime) v4.5.0 (MIT) — 소개·시연 페이지와 폰 앱의 움직임 (움직임 줄이기 설정 존중)
- Air API: Qwen3.8-27B(비전), DeepSeek-V4.1-Flash(글), Qwen3-TTS(음성)

## 팀 Camelon

<table>
  <tr>
    <td align="center" width="200"><b>박도연</b></td>
    <td align="center" width="200"><b>여지원</b></td>
    <td align="center" width="200"><b>윤진영</b></td>
  </tr>
</table>

## 개인정보

프로필 QR에는 말 빠르기·글씨·안내 자세함·적립/권유 설정만 들어갑니다. 이름·연락처·장애 여부는 받지 않습니다. 카메라 사진은 안내에만 쓰고, 서버에는 평가용 기록을 `eval/private/`(git 제외)에만 남깁니다.
