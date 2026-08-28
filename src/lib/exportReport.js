// Result export helpers (CSV for spreadsheets, JSON as a full backup).
import { STATUS_LABELS } from "../data/gameData.js";
import { countAiGrades, getAssetChange, getStudentsByTeam, rankTeams } from "./game.js";

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function timestamp(value) {
  return value ? new Date(Number(value)).toLocaleString("ko-KR") : "";
}

/** One row per team, ranked by final asset. */
export function buildTeamResultsCsv(room) {
  const students = room?.students || {};
  const header = [
    "순위", "팀", "팀원", "팀장", "C레벨 구성", "다양성 판정", "다양성 보너스(%)",
    "트렌드", "기술카드", "제품 및 서비스명", "문제정의", "고객", "해결 아이디어", "제품/서비스 설명", "수익모델", "마케팅",
    "AI 양호", "AI 보통", "AI 취약", "AI 총평",
    "기본 자산", "투자 유치", "최초 총 자산", "최종 총 자산", "증감액", "증감율(%)"
  ];
  const rows = rankTeams(room?.teams || {}).map((team, index) => {
    const members = getStudentsByTeam(students, team.key);
    const change = getAssetChange(team);
    const grades = countAiGrades(team);
    const leader = members.find((member) => member.uid === team.leaderId);
    const idea = team.idea || {};
    return csvRow([
      index + 1,
      team.teamName,
      members.map((member) => member.nickname).join(" / "),
      leader?.nickname || "",
      members.map((member) => member.cLevelResult?.key || "-").join(" / "),
      team.diversity?.label || "",
      team.diversity?.rate ?? "",
      team.trendCard?.title || "",
      team.techCard?.title || "",
      idea.serviceName || "",
      idea.problem || "",
      (idea.customers || []).join(" / "),
      idea.solution || "",
      idea.product || "",
      (idea.revenueModels || []).join(" / "),
      (idea.marketingStrategies || []).join(" / "),
      grades.양호,
      grades.보통,
      grades.취약,
      team.aiEvaluation?.opinion || "",
      team.baseAsset ?? "",
      team.investmentsReceived ?? 0,
      change.initial,
      change.final,
      change.delta,
      change.rate.toFixed(1)
    ]);
  });
  return [csvRow(header), ...rows].join("\r\n");
}

/** One row per student: team, role, C-level, investments. */
export function buildStudentsCsv(room) {
  const teams = room?.teams || {};
  const header = ["닉네임", "팀", "팀장", "C레벨 유형", "C레벨 점수(CEO/CTO/CFO/CPO/CMO/CSO/COO)", "투자 확정", "투자 내역", "입장 시각"];
  const rows = Object.values(room?.students || {})
    .sort((a, b) => String(a.team || "").localeCompare(String(b.team || "")) || String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko"))
    .map((student) => csvRow([
      student.nickname,
      teams[student.team]?.teamName || "(미배정)",
      teams[student.team]?.leaderId === student.uid ? "O" : "",
      student.cLevelResult?.key || "",
      Array.isArray(student.cLevelResult?.scores) ? student.cLevelResult.scores.join("/") : "",
      student.investmentSubmitted ? "O" : "",
      Object.entries(student.investments || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${teams[key]?.teamName || key}:${Number(value).toLocaleString()}`).join(" / "),
      timestamp(student.joinedAt)
    ]));
  return [csvRow(header), ...rows].join("\r\n");
}

/** Full CSV workbook-style export: a summary block, then teams, then students. */
export function buildFullCsv(room) {
  const summary = [
    csvRow(["방 제목", room?.roomTitle || ""]),
    csvRow(["방 코드", room?.roomId || ""]),
    csvRow(["단계", STATUS_LABELS[room?.status] || room?.status || ""]),
    csvRow(["참가자 수", Object.keys(room?.students || {}).length]),
    csvRow(["내보낸 시각", new Date().toLocaleString("ko-KR")])
  ].join("\r\n");
  return `${summary}\r\n\r\n[팀 결과]\r\n${buildTeamResultsCsv(room)}\r\n\r\n[학생]\r\n${buildStudentsCsv(room)}`;
}

export function buildRoomJson(room) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), room }, null, 2);
}

export function safeFileName(text) {
  return String(text || "bizquest").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
}

/** Triggers a browser download. CSV gets a UTF-8 BOM so Excel opens Korean text correctly. */
export function downloadTextFile(fileName, content, mime = "text/plain") {
  const isCsv = mime.includes("csv");
  const blob = new Blob([isCsv ? "﻿" : "", content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
