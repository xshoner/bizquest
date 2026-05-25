import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, KeyRound, RotateCcw, Save, Settings, Trash2 } from "lucide-react";
import { collection, db, doc, getDocs, setDoc, writeBatch } from "../firebase.js";
import { APP_SETTINGS_PATH, DEFAULT_APP_SETTINGS, mergeAppSettings, useAppSettings } from "../lib/appSettings.js";

function linesToList(value) {
  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToLines(value = []) {
  return value.join("\n");
}

function valueItemsToText(items = []) {
  return items.map((item) => `${item.title} | ${item.description}`).join("\n");
}

function textToValueItems(value) {
  return linesToList(value).map((line) => {
    const [title, ...descriptionParts] = line.split("|").map((part) => part.trim());
    return {
      title: title || "제목",
      description: descriptionParts.join(" | ") || ""
    };
  });
}

export default function SettingsPage() {
  const { settings, loading, error } = useAppSettings();
  const [unlocked, setUnlocked] = useState(localStorage.getItem("bizquest-settings-unlocked") === "true");
  const [passcode, setPasscode] = useState("");
  const [form, setForm] = useState(settings);
  const [featureText, setFeatureText] = useState("");
  const [flowText, setFlowText] = useState("");
  const [valueText, setValueText] = useState("");
  const [status, setStatus] = useState("");
  const [roomCount, setRoomCount] = useState(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const nextSettings = mergeAppSettings(settings);
    setForm(nextSettings);
    setFeatureText(listToLines(nextSettings.landing.featureButtons));
    setFlowText(listToLines(nextSettings.landing.flowSteps));
    setValueText(valueItemsToText(nextSettings.landing.valueItems));
  }, [settings]);

  const maskedGeminiKey = useMemo(() => {
    if (!form.geminiApiKey) return "등록된 키 없음";
    return `${form.geminiApiKey.slice(0, 8)}...${form.geminiApiKey.slice(-6)}`;
  }, [form.geminiApiKey]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateLandingField(key, value) {
    setForm((current) => ({
      ...current,
      landing: { ...current.landing, [key]: value }
    }));
  }

  function unlock() {
    if (passcode.trim() !== String(settings.adminPasscode || DEFAULT_APP_SETTINGS.adminPasscode)) {
      setStatus("관리자 비밀번호가 맞지 않습니다.");
      return;
    }
    localStorage.setItem("bizquest-settings-unlocked", "true");
    setUnlocked(true);
    setStatus("");
  }

  async function saveSettings() {
    setBusy(true);
    setStatus("");
    try {
      const payload = mergeAppSettings({
        ...form,
        landing: {
          ...form.landing,
          featureButtons: linesToList(featureText),
          flowSteps: linesToList(flowText),
          valueItems: textToValueItems(valueText)
        }
      });
      await setDoc(doc(db, ...APP_SETTINGS_PATH), payload, { merge: true });
      setStatus("설정을 저장했습니다. 메인 홈페이지와 AI 평가에 바로 반영됩니다.");
    } catch (err) {
      setStatus(err.message || "설정 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRoomCount() {
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await getDocs(collection(db, "rooms"));
      setRoomCount(snapshot.size);
      setStatus(`현재 삭제 대상 게임방 데이터는 ${snapshot.size}개입니다.`);
    } catch (err) {
      setStatus(err.message || "게임방 데이터 수를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function resetGameRooms() {
    if (resetConfirm.trim() !== "초기화") {
      setStatus("삭제하려면 확인 입력칸에 '초기화'를 입력하세요.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await getDocs(collection(db, "rooms"));
      let deleted = 0;
      let batch = writeBatch(db);
      let batchCount = 0;
      for (const roomDoc of snapshot.docs) {
        batch.delete(roomDoc.ref);
        batchCount += 1;
        deleted += 1;
        if (batchCount === 450) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
      setRoomCount(0);
      setResetConfirm("");
      setStatus(`게임방 데이터 ${deleted}개를 삭제했습니다. appSettings 설정 문서는 유지했습니다.`);
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
    setFeatureText(listToLines(DEFAULT_APP_SETTINGS.landing.featureButtons));
    setFlowText(listToLines(DEFAULT_APP_SETTINGS.landing.flowSteps));
    setValueText(valueItemsToText(DEFAULT_APP_SETTINGS.landing.valueItems));
  }

  if (loading) return <div className="settings-page">설정을 불러오는 중입니다.</div>;

  if (!unlocked) {
    return (
      <section className="settings-page">
        <div className="settings-login">
          <Settings size={34} />
          <h1>관리자 설정</h1>
          <p>설정 페이지 접근을 위해 관리자 비밀번호를 입력하세요.</p>
          <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && unlock()} placeholder="관리자 비밀번호" />
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
          <span>이 페이지의 저장값은 Firebase `appSettings/global`에 기록됩니다.</span>
        </div>
        <Link to="/">메인으로 돌아가기</Link>
      </header>

      {status && <div className="settings-status">{status}</div>}
      {error && <div className="settings-status settings-status-error">{error}</div>}

      <div className="settings-grid">
        <section className="settings-panel">
          <h2><KeyRound size={20} /> API 및 관리자</h2>
          <label>Gemini API Key</label>
          <input value={form.geminiApiKey || ""} onChange={(event) => updateField("geminiApiKey", event.target.value)} placeholder="Gemini API Key" />
          <p className="settings-help">현재 키: {maskedGeminiKey}</p>

          <label>관리자 비밀번호</label>
          <input value={form.adminPasscode || ""} onChange={(event) => updateField("adminPasscode", event.target.value)} placeholder="관리자 비밀번호" />

          <label>기본 방 제목</label>
          <input value={form.defaultRoomTitle || ""} onChange={(event) => updateField("defaultRoomTitle", event.target.value)} />

          <label>로컬 학생 접속 호스트</label>
          <input value={form.studentOriginHost || ""} onChange={(event) => updateField("studentOriginHost", event.target.value)} placeholder="예: 192.168.0.190" />
          <p className="settings-help">교사용 PC가 localhost로 열렸을 때 학생 QR 주소에 사용할 IP입니다.</p>
        </section>

        <section className="settings-panel">
          <h2><Settings size={20} /> 메인 홈페이지 텍스트</h2>
          <label>상단 이미지 대체 텍스트</label>
          <input value={form.landing.heroAlt || ""} onChange={(event) => updateLandingField("heroAlt", event.target.value)} />
          <div className="settings-two-col">
            <div>
              <label>시작 버튼</label>
              <input value={form.landing.startLink || ""} onChange={(event) => updateLandingField("startLink", event.target.value)} />
            </div>
            <div>
              <label>흐름 버튼</label>
              <input value={form.landing.flowLink || ""} onChange={(event) => updateLandingField("flowLink", event.target.value)} />
            </div>
          </div>
          <label>섹션 작은 문구</label>
          <input value={form.landing.sectionEyebrow || ""} onChange={(event) => updateLandingField("sectionEyebrow", event.target.value)} />
          <label>섹션 제목</label>
          <input value={form.landing.sectionTitle || ""} onChange={(event) => updateLandingField("sectionTitle", event.target.value)} />
          <div className="settings-two-col">
            <div>
              <label>교사용 카드 제목</label>
              <input value={form.landing.teacherTitle || ""} onChange={(event) => updateLandingField("teacherTitle", event.target.value)} />
            </div>
            <div>
              <label>학생용 카드 제목</label>
              <input value={form.landing.studentTitle || ""} onChange={(event) => updateLandingField("studentTitle", event.target.value)} />
            </div>
          </div>
          <label>교사용 카드 설명</label>
          <input value={form.landing.teacherDescription || ""} onChange={(event) => updateLandingField("teacherDescription", event.target.value)} />
          <label>학생용 카드 설명</label>
          <input value={form.landing.studentDescription || ""} onChange={(event) => updateLandingField("studentDescription", event.target.value)} />
          <div className="settings-two-col">
            <div>
              <label>방 제목 라벨</label>
              <input value={form.landing.roomTitleLabel || ""} onChange={(event) => updateLandingField("roomTitleLabel", event.target.value)} />
            </div>
            <div>
              <label>방 만들기 버튼</label>
              <input value={form.landing.createButton || ""} onChange={(event) => updateLandingField("createButton", event.target.value)} />
            </div>
          </div>
          <div className="settings-two-col">
            <div>
              <label>방 코드 라벨</label>
              <input value={form.landing.joinCodeLabel || ""} onChange={(event) => updateLandingField("joinCodeLabel", event.target.value)} />
            </div>
            <div>
              <label>입장 버튼</label>
              <input value={form.landing.joinButton || ""} onChange={(event) => updateLandingField("joinButton", event.target.value)} />
            </div>
          </div>
          <label>방 코드 입력 예시</label>
          <input value={form.landing.joinPlaceholder || ""} onChange={(event) => updateLandingField("joinPlaceholder", event.target.value)} />
        </section>

        <section className="settings-panel">
          <h2>홈페이지 목록 문구</h2>
          <label>기능 버튼 목록</label>
          <textarea value={featureText} onChange={(event) => setFeatureText(event.target.value)} rows={5} />
          <label>수업 흐름 목록</label>
          <textarea value={flowText} onChange={(event) => setFlowText(event.target.value)} rows={7} />
          <label>가치 설명 목록</label>
          <textarea value={valueText} onChange={(event) => setValueText(event.target.value)} rows={8} />
          <p className="settings-help">가치 설명은 `제목 | 설명` 형식으로 한 줄에 하나씩 입력합니다.</p>
        </section>

        <section className="settings-panel">
          <h2>푸터 및 연락처</h2>
          <label>푸터 브랜드명</label>
          <input value={form.landing.footerBrand || ""} onChange={(event) => updateLandingField("footerBrand", event.target.value)} />
          <label>푸터 문구</label>
          <input value={form.landing.footerTagline || ""} onChange={(event) => updateLandingField("footerTagline", event.target.value)} />
          <label>이메일</label>
          <input value={form.landing.contactEmail || ""} onChange={(event) => updateLandingField("contactEmail", event.target.value)} />
          <label>전화번호</label>
          <input value={form.landing.contactPhone || ""} onChange={(event) => updateLandingField("contactPhone", event.target.value)} />
          <button type="button" className="settings-secondary-button" onClick={resetLandingDefaults}><RotateCcw size={16} /> 홈페이지 문구 기본값으로 되돌리기</button>
        </section>

        <section className="settings-panel settings-danger-panel">
          <h2><AlertTriangle size={20} /> 게임 데이터 초기화</h2>
          <p>삭제 대상은 Firebase `rooms` 컬렉션뿐입니다. `appSettings/global` 설정 문서와 앱 동작에 필요한 코드/이미지/설정 파일은 삭제하지 않습니다.</p>
          <button type="button" className="settings-secondary-button" onClick={loadRoomCount} disabled={busy}>삭제 대상 개수 확인</button>
          {roomCount !== null && <p className="settings-help">현재 게임방 데이터: {roomCount}개</p>}
          <label>확인 입력</label>
          <input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} placeholder="초기화" />
          <button type="button" className="settings-danger-button" onClick={resetGameRooms} disabled={busy}>
            <Trash2 size={16} />
            기존 학생 게임 데이터 삭제
          </button>
        </section>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={saveSettings} disabled={busy}><Save size={18} /> 설정 저장</button>
      </div>
    </section>
  );
}
