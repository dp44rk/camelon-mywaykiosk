import re, html
SRC='u/word/document.xml'
s=open(SRC,encoding='utf8').read()

# 1) 두 번째 표(참가신청서 사본) 제거: 별도 참가신청서 양식으로 제출
tbls=[m.start() for m in re.finditer(r'<w:tbl>',s)]
end_first = s.index('</w:tbl>', tbls[0]) + len('</w:tbl>')
sect = s.index('<w:sectPr')
# 두 번째 표 앞의 빈 문단은 그대로 두고, 두 번째 표 ~ sectPr 앞까지 삭제
s = s[:tbls[1]] + s[sect:].replace('<w:sectPr', '<w:p/><w:sectPr', 1) if False else s[:tbls[1]] + s[s.rfind('<w:p', 0, sect) if False else sect:]

SZ = '19'  # 9.5pt
def run(t, bold=False, color=None):
    rpr = '<w:rFonts w:hint="eastAsia"/>' + ('<w:b/><w:bCs/>' if bold else '') + (f'<w:color w:val="{color}"/>' if color else '') + f'<w:sz w:val="{SZ}"/><w:szCs w:val="{SZ}"/>'
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{html.escape(t, quote=False)}</w:t></w:r>'
def para(parts, indent=0, after=20):
    ind = f'<w:ind w:left="{indent}" w:hanging="{180 if indent else 0}"/>' if indent else ''
    body = ''.join(run(t, b) for t, b in parts)
    return f'<w:p><w:pPr><w:wordWrap/><w:spacing w:after="{after}" w:line="276" w:lineRule="auto"/>{ind}</w:pPr>{body}</w:p>'
def O(head, rest=''):  # ㅇ 항목: 굵은 머리 + 본문
    return para([('ㅇ ', False), (head, True), (rest, False)], indent=180)
def D(text):  # - 하위 항목
    return para([('- ', False), (text, False)], indent=400)
def P(text, bold=False):
    return para([(text, bold)])

CELLS = {
 'name': [P('내 방식 QR — 카메라 키오스크 길잡이 (비전 AI 화면 이해 + AI 화면 변환)', True)],
 'idea': [P('5번. 내 방식 QR - 범용 접근성 프로필 패스', True)],
 'summary': [
   D('어르신이 아무 키오스크나 폰 카메라로 비추면, 비전 AI가 화면의 버튼·위치·종류를 읽고 목표(예: 차가운 아메리카노 포장)까지 지금 누를 버튼 하나를 이어폰으로 쉬운 말로 안내함'),
   D('「내 방식 QR」 연동 키오스크는 화면 구조를 넘겨받아 AI가 큰 글씨·쉬운 말·묶음으로 화면을 다시 설계(AI 화면 변환)하고, 변환된 버튼은 원래 버튼과 연결되어 기존 결제 흐름을 유지함'),
   D('위치·색 말하기, 결제 전 확인, 쉬운 말 검사는 규칙 코드가 맡아 AI 오류가 잘못된 결제나 지어낸 안내로 이어지지 않게 함'),
 ],
 'goal': [
   O('업체 협조 없이 지금 있는 카페·식당 키오스크에서 고령층이 혼자 주문을 끝내도록 돕는 폰 길잡이 + 연동 키오스크의 실시간 AI 화면 변환 시제품'),
   D('지표: 주문 완료율, 화면 변환 성공률(버튼 보존·지어낸 버튼 0), 쉬운 말 지표, 결제 안전(확인 없는 결제 안내 0건)'),
 ],
 'dev': [
   O('문제 정의 ', '65세 이상 64.2%가 키오스크 주문에 어려움(보건복지부 2020 노인실태조사), 불편 이유 1위 절차 복잡 51.4%(한국소비자원). 원제안자 사전질의 답변(카페·식당 우선, 키오스크에 뜬 QR을 폰으로 스캔, 화면 변환은 AI가 실시간으로, 글씨>버튼>설명, 변환 성공률 중시)을 요구사항으로 반영'),
   O('AI 접근 방법'),
   D('화면 이해: 폰 사진 → Qwen3.5-9B 비전 모델(Air API)이 화면 종류·버튼 글자·좌표·목표에 맞는 버튼을 JSON으로 출력 → 형식·좌표 검증'),
   D('목표 이해: DeepSeek-V4.1-Flash가 "아이스 아메리카노 하나 가져갈 거야"를 주문 구조로 정리하고 "맞아요?"로 되물음'),
   D('AI 화면 변환: 화면 구조 → 쉬운 말 라벨·묶음·순서 설계(JSON) → 검증기(빠진·지어낸·중복 버튼 보정, 어려운 라벨 교체) → 같은 화면은 저장해 재사용, AI가 늦으면 규칙 변환을 먼저 표시'),
   D('규칙 계층: 9칸 위치·같은 칸 순서·픽셀 색 이름, 결제 전 금액 확인·권유 거절·3번 막히면 직원 도움 화면, 쉬운 말 사전·검사기(국립국어원 2024 고령층 키오스크 쉬운 언어 예시 기반: 문장 길이·할 일 수·외래어)'),
   D('음성: Qwen3-TTS(실패 시 폰 내장 음성), 브라우저 음성 인식. 프로필 QR에는 개인정보 없이 설정만 담음'),
   O('구현 결과 ', '폰 앱(PWA), Node 중계 서버, 목업 카페·식당 키오스크(영어 라벨·광고·세트 권유·적립·목업 결제), 서버 없이 도는 시연 페이지'),
   D('연동 모드: 폰 안내대로만 눌러 목표 5개(카페 3·식당 2, 다른 분류 탭 메뉴 포함) 모두 주문 완료 (자동 시험, 11~14단계)'),
   D('AI 화면 변환(DeepSeek-V4.1-Flash, 69화면·389버튼): 버튼 보존 100%·지어낸 버튼 0, 고침 없이 통과 73.9%(18화면은 검증기가 어려운 라벨 31개를 쉬운 말로 교체 → 최종 어려운 라벨 178개 → 0), 응답 중앙값 2.7초. 규칙 변환 바닥선 성공 100%'),
   D('쉬운 말: 어려운 말 100어절당 29.2 → 0, 화면당 선택지 평균 8.1개 → 안내당 할 일 1개 이하 (같은 사전으로 생성·검사한 지표라는 한계 명시)'),
   D('카메라 모드(Qwen3.5-9B, 목업 69화면 × 사진 변형 4종 = 276장): 누를 버튼 적중 86.1%(어두운 사진 81.5%~비스듬한 사진 88.9%), 화면 종류 88.8%, 결제 안전 100%(20장), 사진→안내 중앙값 2.3초. 약점: 광고 팝업 10/20, 옵션 화면 17/28'),
   P('※ 시연 https://dp44rk.github.io/myway/  ·  코드 https://github.com/dp44rk/camelon-mywaykiosk'),
 ],
 'pain': [
   O('실제 키오스크 사진 데이터 부족 ', '→ 목업 키오스크 캡처와 사진 변형으로 정답 상자를 자동 생성. 저작권 표시가 있는 공개 스크린샷 모음은 쓰지 않음'),
   O('비전 모델의 지연·좌표 오차 ', '→ 위치·색은 규칙으로 계산, 한 장 찍고 내려놓는 방식, 기다리는 동안 "보고 있어요" 안내'),
   O('Air API 연동 ', '→ 글 모델이 생각(reasoning)에 토큰을 다 써 빈 답이 오던 문제는 생각 몫 토큰을 따로 둬 해결. Qwen3.8-27B 엔드포인트가 이미지 요청을 거부(400)해 점검 스크립트로 원인을 분리하고 이미지가 되는 Qwen3.5-9B로 전환'),
   O('같은 사전으로 만들고 검사하는 지표의 순환성 ', '→ 바닥선 의미로만 해석하고, 어르신 사용자 시험을 다음 과제로 둠'),
 ],
 'effect': [
   O('디지털 포용 ', '업체 협조 없이 기존 키오스크(2022년 45만여 대)에 바로 쓸 수 있는 고령층 주문 보조 수단'),
   O('사업화 ', '연동 키오스크는 화면 구조를 넘기는 정도의 수정으로 AI 화면 변환·케이스 저장 → 매장마다 접근성 화면을 따로 만들 부담 감소'),
   O('확장 ', '가족이 QR로 설정을 대신 전달, 개인정보 없는 프로필 → 병원 접수·관공서, 다국어, 손끝 추적'),
 ],
}

# 2) 첫 표의 각 행 두 번째 칸 내용을 교체
t0s = s.index('<w:tbl>'); t0e = s.index('</w:tbl>', t0s)
tbl = s[t0s:t0e]
rows = re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S)
order = [None, 'name', 'idea', 'summary', 'goal', 'dev', 'pain', 'effect']
new_rows = []
for i, r in enumerate(rows):
    key = order[i] if i < len(order) else None
    if key:
        tcs = list(re.finditer(r'<w:tc>.*?</w:tc>', r, re.S))
        tc = tcs[-1]
        tcpr = re.search(r'<w:tcPr>.*?</w:tcPr>', tc.group(0), re.S).group(0)
        tcpr = re.sub(r'<w:vAlign [^>]*/>', '', tcpr)
        newtc = '<w:tc>' + tcpr + ''.join(CELLS[key]) + '</w:tc>'
        r = r[:tc.start()] + newtc + r[tc.end():]
        # 행 높이 고정이 있으면 최소 높이로만
        r = re.sub(r'<w:trHeight w:val="(\d+)"( w:hRule="exact")?/>', '<w:trHeight w:val="400"/>', r)
    new_rows.append(r)
newtbl = tbl
for a, b in zip(rows, new_rows): newtbl = newtbl.replace(a, b, 1)
s = s[:t0s] + newtbl + s[t0e:]
open(SRC, 'w', encoding='utf8').write(s)
print('ok')

# 3) 그림 추가: 개발 내용 칸 끝에 목업 2장(폰 흐름 / 키오스크 변환)
import os, shutil
os.makedirs('u/word/media', exist_ok=True)
shutil.copy('fig.jpg', 'u/word/media/fig1.jpg')
rels = open('u/word/_rels/document.xml.rels', encoding='utf8').read()
if 'media/fig1.jpg' not in rels:
    rels = rels.replace('</Relationships>', '<Relationship Id="rIdFig1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig1.jpg"/></Relationships>')
    open('u/word/_rels/document.xml.rels', 'w', encoding='utf8').write(rels)
ct = open('u/[Content_Types].xml', encoding='utf8').read()
if 'Extension="jpg"' not in ct:
    ct = ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="jpg" ContentType="image/jpeg"/>')
    open('u/[Content_Types].xml', 'w', encoding='utf8').write(ct)
cx = int(15.0 * 360000); cy = int(cx * 742 / 2000)
drawing = f'''<w:p><w:pPr><w:spacing w:before="80" w:after="20"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="901" name="그림 1" descr="폰 앱 흐름과 AI 화면 변환 전후 목업"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="901" name="fig1.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdFig1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'''
cap = para([('[그림] 왼쪽: 폰 앱(내 방식 정하기 · 누를 곳 안내 · 결제 금액 확인)   오른쪽: 원래 키오스크 화면 → AI 화면 변환', False)])
s = open(SRC, encoding='utf8').read()
marker = '※ 시연 https://dp44rk.github.io/myway/'
i = s.index(marker); pe = s.index('</w:p>', i) + len('</w:p>')
s = s[:pe] + drawing + cap.replace('<w:jc', '<w:jc') + s[pe:]
open(SRC, 'w', encoding='utf8').write(s)
print('fig ok')
