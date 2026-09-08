import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, KeyRound, RotateCcw, Save, Settings, Trash2 } from "lucide-react";
import { collection, db, deleteDoc, doc, getCurrentIdToken, getDocs, setDoc } from "../firebase.js";
import { createManagedTeacher, readLocalTeacherRegistry, useTeacherAuth } from "../hooks/useTeacherAuth.js";
import { deleteRoomDeep } from "../lib/roomStore.js";
import { APP_SETTINGS_PATH, DEFAULT_APP_SETTINGS, LOCAL_APP_SETTINGS_KEY, mergeAppSettings, useAppSettings } from "../lib/appSettings.js";
import { BUSINESS_FACTORS, SIMULATION_EVENTS } from "../data/gameData.js";

function uniqueUsers(items) {
  const map = new Map();
  for (const item of items) {
    const key = item?.uid || item?.id;
    if (!key) continue;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => Number(b.createdAt || b.savedAt || 0) - Number(a.createdAt || a.savedAt || 0));
}

function displayEmail(item) {
  const email = String(item?.email || "").trim();
  return email && !email.endsWith("@bizquest.local") ? email : "-";
}

export default function SettingsPage() {
  const authState = useTeacherAuth();
  const { settings, loading, error } = useAppSettings();
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem("bizquest-settings-unlocked") === "true");
  const [passcode, setPasscode] = useState("");
  const [form, setForm] = useState(() => mergeAppSettings(settings));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [roomCount, setRoomCount] = useState(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [registryUsers, setRegistryUsers] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);
  const [localUsers, setLocalUsers] = useState(() => readLocalTeacherRegistry());
  const [managedForm, setManagedForm] = useState({ id: "", password: "", email: "" });
  const [geminiCheck, setGeminiCheck] = useState({ state: "idle", keys: null, message: "" });

  const teacherUsers = useMemo(
    () => uniqueUsers([...registryUsers, ...managedUsers, ...localUsers]),
    [localUsers, managedUsers, registryUsers]
  );

  useEffect(() => {
    setForm(mergeAppSettings(settings));
  }, [settings]);

  useEffect(() => {
    if (!loading && authState.loggedIn && !settings.adminPasscode) setUnlocked(true);
  }, [authState.loggedIn, loading, settings.adminPasscode]);

  useEffect(() => {
    setLocalUsers(readLocalTeacherRegistry());
    if (unlocked) loadTeacherUsers();
  }, [unlocked, authState.user?.uid]);

  function unlock() {
    if (!settings.adminPasscode) {
      setStatus("최초 관리자 패스코드를 설정하려면 먼저 교사 계정으로 로그인하세요.");
      return;
    }
    if (passcode.trim() !== String(settings.adminPasscode)) {
      setStatus("관리자 비밀번호가 맞지 않습니다.");
      return;
    }
    sessionStorage.setItem("bizquest-settings-unlocked", "true");
    setUnlocked(true);
    setStatus("");
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLandingField(key, value) {
    setForm((current) => ({ ...current, landing: { ...current.landing, [key]: value } }));
  }

  function updateManagedField(key, value) {
    setManagedForm((current) => ({ ...current, [key]: value }));
  }

  async function checkGeminiKeys() {
    setGeminiCheck({ state: "checking", keys: null, message: "두 API 키를 각각 짧게 호출하는 중입니다..." });
    try {
      const idToken = await getCurrentIdToken(true);
      const response = await fetch("/api/gemini-health", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `점검 요청 실패 (HTTP ${response.status})`);
      }
      const payload = await response.json();
      setGeminiCheck({ state: "done", keys: payload.keys, message: `${payload.model} 호출 점검 완료` });
    } catch (err) {
      setGeminiCheck({ state: "error", keys: null, message: err.message || "Gemini API 키를 점검하지 못했습니다." });
    }
  }

  function updatePivotScenario(index, key, value) {
    setForm((current) => {
      const pivotScenarios = current.simulation.pivotScenarios.map((scenario, scenarioIndex) => scenarioIndex === index ? { ...scenario, [key]: Number(value) } : scenario);
      return { ...current, simulation: { ...current.simulation, pivotScenarios } };
    });
  }

  function updateEventMultiplier(eventId, direction, value) {
    setForm((current) => ({
      ...current,
      simulation: {
        ...current.simulation,
        eventMultipliers: {
          ...current.simulation.eventMultipliers,
          [eventId]: { ...current.simulation.eventMultipliers[eventId], [direction]: Number(value) }
        }
      }
    }));
  }

  function updateFactorMultiplier(factorId, grade, value) {
    setForm((current) => ({
      ...current,
      simulation: {
        ...current.simulation,
        factorGradeMultipliers: {
          ...current.simulation.factorGradeMultipliers,
          [factorId]: { ...current.simulation.factorGradeMultipliers[factorId], [grade]: Number(value) }
        }
      }
    }));
  }

  async function saveSettings() {
    setBusy(true);
    setStatus("");
    try {
      const nextPasscode = String(form.adminPasscode || "").trim();
      if (nextPasscode.length < 6) throw new Error("관리자 패스코드는 6자리 이상으로 설정하세요.");
      if (!settings.adminPasscodeChangedAt && nextPasscode === String(settings.adminPasscode || "")) {
        throw new Error("초기 관리자 패스코드를 새 값으로 변경해야 합니다.");
      }
      if (!authState.user?.uid) throw new Error("관리자 설정을 저장하려면 교사 계정 로그인이 필요합니다.");
      const cleanPayload = JSON.parse(JSON.stringify({
        ...mergeAppSettings(form),
        adminPasscode: nextPasscode,
        adminPasscodeChangedAt: nextPasscode !== settings.adminPasscode || !settings.adminPasscodeChangedAt ? Date.now() : settings.adminPasscodeChangedAt,
        updatedAt: Date.now()
      }));
      delete cleanPayload.geminiApiKey;
      localStorage.setItem(LOCAL_APP_SETTINGS_KEY, JSON.stringify(cleanPayload));
      await setDoc(doc(db, ...APP_SETTINGS_PATH), cleanPayload);
      setForm(cleanPayload);
      setStatus("설정을 저장했습니다.");
    } catch (err) {
      setStatus(err.message || "설정 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loadTeacherUsers() {
    const nextLocalUsers = readLocalTeacherRegistry();
    setLocalUsers(nextLocalUsers);

    try {
      const registrySnapshot = await getDocs(collection(db, "teacherRegistry"));
      setRegistryUsers(registrySnapshot.docs.map((item) => item.data()));
    } catch {
      setRegistryUsers([]);
      setStatus("공용 회원 목록 권한이 없습니다. Firebase 규칙에서 teacherRegistry 읽기를 허용하세요.");
    }

    if (authState.user?.uid) {
      try {
        const managedSnapshot = await getDocs(collection(db, "users", authState.user.uid, "managedUsers"));
        setManagedUsers(managedSnapshot.docs.map((item) => item.data()));
      } catch {
        setManagedUsers([]);
      }
    } else {
      setManagedUsers([]);
    }
  }

  async function createManagedUser() {
    setBusy(true);
    setStatus("");
    try {
      const result = await createManagedTeacher(authState.user, managedForm);
      setManagedForm({ id: "", password: "", email: "" });
      setManagedUsers((current) => uniqueUsers([result.profile, ...current]));
      setRegistryUsers((current) => uniqueUsers([result.profile, ...current]));
      setLocalUsers(readLocalTeacherRegistry());
      await loadTeacherUsers();
      setStatus("회원을 생성했습니다. 생성한 id/pw로 로그인할 수 있습니다.");
    } catch (err) {
      setStatus(err.message || "회원 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeacherInfo(item) {
    const key = item?.uid || item?.id;
    if (!key) return;
    if (!window.confirm(`${item.id || "회원"} 정보를 목록에서 삭제할까요? Firebase Auth 계정 자체는 삭제되지 않습니다.`)) return;
    setBusy(true);
    setStatus("");
    try {
      if (item.uid) {
        await deleteDoc(doc(db, "teacherRegistry", item.uid)).catch(() => {});
        if (authState.user?.uid) {
          await deleteDoc(doc(db, "users", authState.user.uid, "managedUsers", item.uid)).catch(() => {});
        }
      }
      setRegistryUsers((current) => current.filter((user) => (user.uid || user.id) !== key));
      setManagedUsers((current) => current.filter((user) => (user.uid || user.id) !== key));
      setLocalUsers((current) => current.filter((user) => (user.uid || user.id) !== key));
      setStatus("회원 표시 정보를 삭제했습니다.");
    } catch (err) {
      setStatus(err.message || "회원 정보 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRoomCount() {
    if (!authState.user?.uid) {
      setStatus("로그인 후 데이터를 확인할 수 있습니다.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await getDocs(collection(db, "users", authState.user.uid, "rooms"));
      setRoomCount(snapshot.size);
      setStatus(`현재 내 계정의 게임방 데이터는 ${snapshot.size}개입니다.`);
    } catch (err) {
      setStatus(err.message || "게임방 데이터를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resetGameRooms() {
    if (!authState.user?.uid) {
      setStatus("로그인 후 데이터를 삭제할 수 있습니다.");
      return;
    }
    if (resetConfirm.trim() !== "초기화") {
      setStatus("삭제하려면 확인 입력칸에 '초기화'를 입력하세요.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await getDocs(collection(db, "users", authState.user.uid, "rooms"));
      let deleted = 0;
      for (const roomDoc of snapshot.docs) {
        // Also removes each room's students sub-collection.
        await deleteRoomDeep(authState.user.uid, roomDoc.id);
        deleted += 1;
      }
      setRoomCount(0);
      setResetConfirm("");
      setStatus(`게임방 데이터 ${deleted}개를 삭제했습니다.`);
    } catch (err) {
      setStatus(err.message || "게임방 데이터 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function resetLandingDefaults() {
    setForm((current) => ({
      ...current,
      defaultRoomTitle: DEFAULT_APP_SETTINGS.defaultRoomTitle,
      landing: DEFAULT_APP_SETTINGS.landing
    }));
  }

  if (loading) return <div className="settings-page">설정을 불러오는 중입니다.</div>;

  if (!unlocked) {
    return (
      <section className="settings-page">
        <div className="settings-login">
          <Settings size={34} />
          <h1>관리자 설정</h1>
          <p>설정 페이지 접근을 위해 관리자 비밀번호를 입력하세요.</p>
          <input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && unlock()}
            placeholder="관리자 비밀번호"
          />
          <button type="button" onClick={unlock}>접속하기</button>
          {status && <p className="settings-status settings-status-error">{status}</p>}
          {error && <p className="settings-status settings-status-error">{error}</p>}
          <Link to="/">메인으로 돌아가기</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <p>Admin Only</p>
          <h1>관리자 설정</h1>
          <span>모든 기기에서 가입한 회원 리스트와 메인 화면 기본 설정을 관리합니다.</span>
        </div>
        <Link to="/">메인으로 돌아가기</Link>
      </header>

      {status && <div className="settings-status">{status}</div>}
      {error && <div className="settings-status settings-status-error">{error}</div>}
      {!settings.adminPasscodeChangedAt && (
        <div className="settings-status settings-status-error">보안을 위해 초기 관리자 패스코드를 6자리 이상의 새 값으로 변경한 뒤 설정을 저장하세요.</div>
      )}

      <div className="settings-grid">
        <section className="settings-panel settings-panel-wide gemini-health-panel">
          <div className="gemini-health-heading">
            <div>
              <h2><Activity size={20} /> Gemini API 키 호출 점검</h2>
              <p className="settings-help">서버 환경변수의 기본키와 보조키를 각각 최소 입력·출력으로 실제 호출합니다. 키 값은 브라우저로 전송하지 않습니다.</p>
            </div>
            <button type="button" className="settings-secondary-button" onClick={checkGeminiKeys} disabled={!authState.loggedIn || geminiCheck.state === "checking"}>
              <Activity size={16} /> {geminiCheck.state === "checking" ? "점검 중..." : "두 키 호출 점검"}
            </button>
          </div>
          {!authState.loggedIn && <p className="settings-status settings-status-error">호출 점검은 교사 계정 로그인 후 사용할 수 있습니다.</p>}
          <div className="gemini-health-grid">
            {[["primary", "GEMINI_API_KEY · 기본키"], ["secondary", "GEMINI_API_KEY_2 · 보조키"]].map(([key, label]) => {
              const result = geminiCheck.keys?.[key];
              const tone = result ? (result.ok ? "ok" : "error") : geminiCheck.state === "checking" ? "checking" : "idle";
              return <article key={key} className={`gemini-health-card gemini-health-${tone}`}>
                <span className="gemini-health-light" aria-label={result?.ok ? "정상" : result ? "이상" : "미점검"} />
                <div><strong>{label}</strong><small>{result ? `${result.message}${result.latencyMs !== undefined ? ` · ${result.latencyMs}ms` : ""}` : geminiCheck.state === "checking" ? "호출 확인 중" : "아직 점검하지 않았습니다."}</small></div>
              </article>;
            })}
          </div>
          {geminiCheck.message && <p className={`gemini-health-message ${geminiCheck.state === "error" ? "gemini-health-message-error" : ""}`}>{geminiCheck.message}</p>}
        </section>

        <section className="settings-panel">
          <h2><KeyRound size={20} /> 교사 회원 관리</h2>
          <p className="settings-help">회원가입한 계정과 관리자가 생성한 계정을 공용 목록에서 확인합니다.</p>
          {!authState.loggedIn && <p className="settings-status settings-status-error">회원 생성은 로그인 후 사용할 수 있습니다.</p>}
          <label>id</label>
          <input value={managedForm.id} onChange={(event) => updateManagedField("id", event.target.value)} disabled={!authState.loggedIn || busy} />
          <label>pw</label>
          <input
            type="password"
            value={managedForm.password}
            onChange={(event) => updateManagedField("password", event.target.value)}
            disabled={!authState.loggedIn || busy}
            autoComplete="new-password"
          />
          <p className="settings-help">비밀번호는 8자리 이상(영문, 숫자, 특수문자 허용)</p>
          <label>이메일 주소</label>
          <input type="email" value={managedForm.email} onChange={(event) => updateManagedField("email", event.target.value)} disabled={!authState.loggedIn || busy} />
          <button type="button" className="settings-secondary-button" onClick={createManagedUser} disabled={!authState.loggedIn || busy}>회원 직권 생성</button>

          <div className="managed-user-list">
            {teacherUsers.map((item) => (
              <article key={item.uid || item.id}>
                <div>
                  <strong>{item.id || "-"}</strong>
                  <span>{displayEmail(item)}</span>
                </div>
                <button type="button" onClick={() => deleteTeacherInfo(item)} disabled={busy}>삭제</button>
              </article>
            ))}
            {teacherUsers.length === 0 && <p className="settings-help">아직 확인 가능한 회원이 없습니다.</p>}
          </div>
        </section>

        <section className="settings-panel">
          <h2><Settings size={20} /> 기본 설정</h2>
          <label>관리자 비밀번호</label>
          <input type="password" minLength={6} autoComplete="new-password" value={form.adminPasscode || ""} onChange={(event) => updateField("adminPasscode", event.target.value)} />
          <label>기본 방 제목</label>
          <input value={form.defaultRoomTitle || ""} onChange={(event) => updateField("defaultRoomTitle", event.target.value)} />
          <label>학생 접속 호스트</label>
          <input value={form.studentOriginHost || ""} onChange={(event) => updateField("studentOriginHost", event.target.value)} />
          <label>브랜드명</label>
          <input value={form.landing.brandName || ""} onChange={(event) => updateLandingField("brandName", event.target.value)} />
          <label>히어로 제목</label>
          <input value={form.landing.heroTitle || ""} onChange={(event) => updateLandingField("heroTitle", event.target.value)} />
          <label>히어로 설명</label>
          <textarea value={form.landing.heroDescription || ""} onChange={(event) => updateLandingField("heroDescription", event.target.value)} rows={4} />
          <button type="button" className="settings-secondary-button" onClick={resetLandingDefaults}><RotateCcw size={16} /> 랜딩 기본값 복원</button>
        </section>

        <section className="settings-panel settings-danger-panel">
          <h2><AlertTriangle size={20} /> 게임 데이터 초기화</h2>
          <p>현재 로그인한 교사 계정의 게임방 데이터만 확인하거나 삭제합니다.</p>
          <button type="button" className="settings-secondary-button" onClick={loadRoomCount} disabled={busy}>방 데이터 개수 확인</button>
          {roomCount !== null && <p className="settings-help">현재 게임방 데이터: {roomCount}개</p>}
          <label>확인 입력</label>
          <input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} placeholder="초기화" />
          <button type="button" className="settings-danger-button" onClick={resetGameRooms} disabled={busy}>
            <Trash2 size={16} />
            기존 게임방 데이터 삭제
          </button>
        </section>

        <section className="settings-panel settings-panel-wide">
          <h2><Settings size={20} /> 피벗 카드 밸런스</h2>
          <p className="settings-help">금액은 원, 비율은 %, 배율은 1.0이 기본입니다. 카드의 성격은 유지하면서 수업 난이도에 맞게 조정할 수 있습니다.</p>
          <div className="settings-balance-list">
            {form.simulation.pivotScenarios.map((scenario, index) => (
              <article key={scenario.id} className="settings-balance-card">
                <div><strong>{scenario.icon} {scenario.title}</strong><span>{scenario.effectLabel}</span></div>
                <label>즉시 금액<input type="number" step="1000000" value={scenario.immediateAmount || 0} onChange={(event) => updatePivotScenario(index, "immediateAmount", event.target.value)} /></label>
                {scenario.immediateRate !== undefined && <label>즉시 비율(%)<input type="number" step="1" value={scenario.immediateRate || 0} onChange={(event) => updatePivotScenario(index, "immediateRate", event.target.value)} /></label>}
                {scenario.primaryMultiplier !== undefined && <label>주요 배율<input type="number" min="0" step="0.1" value={scenario.primaryMultiplier || 0} onChange={(event) => updatePivotScenario(index, "primaryMultiplier", event.target.value)} /></label>}
                {scenario.secondaryMultiplier !== undefined && <label>보조 배율<input type="number" min="0" step="0.1" value={scenario.secondaryMultiplier || 0} onChange={(event) => updatePivotScenario(index, "secondaryMultiplier", event.target.value)} /></label>}
                {scenario.dilutionRate !== undefined && <label>희석률(%)<input type="number" min="0" max="100" step="1" value={scenario.dilutionRate || 0} onChange={(event) => updatePivotScenario(index, "dilutionRate", event.target.value)} /></label>}
              </article>
            ))}
          </div>
        </section>

        <section className="settings-panel settings-panel-wide">
          <h2><Settings size={20} /> 이벤트 카드 ± 배율</h2>
          <p className="settings-help">각 경영 이벤트의 상승과 하락 강도를 별도로 조정합니다.</p>
          <div className="settings-rate-table">
            <div className="settings-rate-head"><b>카드</b><b>+ 배율</b><b>- 배율</b></div>
            {SIMULATION_EVENTS.map((event) => (
              <div key={event.id} className="settings-rate-row">
                <span><b>{event.id}</b> {event.title}</span>
                <input aria-label={`${event.id} 상승 배율`} type="number" min="0" step="0.1" value={form.simulation.eventMultipliers[event.id]?.positive ?? 1} onChange={(e) => updateEventMultiplier(event.id, "positive", e.target.value)} />
                <input aria-label={`${event.id} 하락 배율`} type="number" min="0" step="0.1" value={form.simulation.eventMultipliers[event.id]?.negative ?? 1} onChange={(e) => updateEventMultiplier(event.id, "negative", e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="settings-panel settings-panel-wide">
          <h2><Settings size={20} /> AI 평가 팩터별 등급 배율</h2>
          <p className="settings-help">F01~F15 각 평가 항목의 양호·보통·취약 결과가 경영 시뮬레이션에 반영되는 강도를 조정합니다.</p>
          <div className="settings-rate-table settings-factor-table">
            <div className="settings-rate-head"><b>팩터</b><b>양호</b><b>보통</b><b>취약</b></div>
            {BUSINESS_FACTORS.map((factor) => (
              <div key={factor.id} className="settings-rate-row">
                <span><b>{factor.id}</b> {factor.name}</span>
                {["양호", "보통", "취약"].map((grade) => <input key={grade} aria-label={`${factor.id} ${grade} 배율`} type="number" min="0" step="0.1" value={form.simulation.factorGradeMultipliers[factor.id]?.[grade] ?? 1} onChange={(e) => updateFactorMultiplier(factor.id, grade, e.target.value)} />)}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={saveSettings} disabled={busy}><Save size={18} /> 설정 저장</button>
      </div>
    </section>
  );
}
