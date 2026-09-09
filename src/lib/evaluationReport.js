import { BUSINESS_FACTORS } from "../data/gameData.js";
import { getEvaluationFactor } from "./aiEvaluation.js";

export function openEvaluationReport(team) {
  const popup = window.open("", "_blank", "popup,width=760,height=850");
  if (!popup) return false;
  popup.opener = null;
  const doc = popup.document;
  doc.title = `${team.teamName} · AI 세부 평가 결과`;
  doc.documentElement.lang = "ko";
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  doc.head.append(viewport);
  const style = doc.createElement("style");
  style.textContent = "body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;background:#f5f7fb;color:#17213b;line-height:1.7;overflow-wrap:anywhere}article{background:white;border:1px solid #dce2ec;border-radius:12px;padding:16px;margin:12px 0}h1{font-size:24px}h2{font-size:17px;margin:0}p{white-space:pre-wrap}button{padding:12px 20px;cursor:pointer}";
  doc.head.append(style);
  const append = (parent, tag, text) => { const element = doc.createElement(tag); element.textContent = text; parent.append(element); return element; };
  append(doc.body, "h1", `${team.teamName} · AI 세부 평가 결과`);
  append(doc.body, "p", team.idea?.serviceName || "사업계획서 평가");
  append(doc.body, "p", team.aiEvaluation?.opinion || "총평이 아직 없습니다.");
  for (const factor of BUSINESS_FACTORS) {
    const result = getEvaluationFactor(team, factor.id);
    const article = append(doc.body, "article", "");
    append(article, "h2", `${factor.id} ${factor.name} · ${result?.grade || "미평가"}`);
    append(article, "p", result?.reason || "이 팩터의 평가 결과가 없습니다. 관리자에게 재평가를 요청하세요.");
    if (factor.effect) append(article, "p", factor.effect);
  }
  const close = append(doc.body, "button", "창 닫기");
  close.onclick = () => popup.close();
  return true;
}
