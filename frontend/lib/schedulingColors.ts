/** 로컬 스케줄링 지표 색상 - 실시간 모니터링의 Prefill/Decode Backlog 스파크라인과
 *  타임라인 차트(범례/영역)가 서로 같은 색을 써야 하므로 한 곳에서 공유한다. */
export const COLOR_PREFILL = "#2DD4BF"; // teal - 워크로드
export const COLOR_DECODE = "#FB923C"; // orange - 워크로드
export const COLOR_KV = "#A78BFA"; // purple - 리소스
// 원래 노란색(#FACC15)이었는데 Decode의 주황(#FB923C)이랑 너무 비슷해 보여서
// 확실히 구분되는 핑크로 바꿨다.
export const COLOR_MODEL = "#F472B6"; // pink - 리소스
