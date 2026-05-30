import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, KeyRound, RotateCcw, Save, Settings, Trash2 } from "lucide-react";
import { collection, db, deleteDoc, doc, getDocs, setDoc, writeBatch } from "../firebase.js";
import { createManagedTeacher, readLocalTeacherRegistry, useTeacherAuth } from "../hooks/useTeacherAuth.js";
import { APP_SETTINGS_PATH, DEFAULT_APP_SETTINGS, LOCAL_APP_SETTINGS_KEY, mergeAppSettings, useAppSettings } from "../lib/appSettings.js";

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
  const [unlocked, setUnlocked] = useState(localStorage.getItem("bizquest-settings-unlocked") === "true");
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

  const teacherUsers = useMemo(
    () => uniqueUsers([...registryUsers, ...managedUsers, ...localUsers]),
    [localUsers, managedUsers, registryUsers]
  );

  useEffect(() => {
    setForm(mergeAppSettings(settings));
  }, [settings]);

  useEffect(() => {
    setLocalUsers(readLocalTeacherRegistry());
    if (unlocked) loadTeacherUsers();
  }, [unlocked, authState.user?.uid]);

  function unlock() {
    if (passcode.trim() !== String(settings.adminPasscode || DEFAULT_APP_SETTINGS.adminPasscode)) {
      setStatus("관리자 비밀번호가 맞지 않습니다.");
      return;
    }
    localStorage.setItem("bizquest-settings-unlocked", "true");
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

  async function saveSettings() {
    setBusy(true);
    setStatus("");
    try {
      const cleanPayload = JSON.parse(JSON.stringify({ ...mergeAppSettings(form), updatedAt: Date.now() }));
      delete cleanPayload.geminiApiKey;
      localStorage.setItem(LOCAL_APP_SETTINGS_KEY, JSON.stringify(cleanPayload));
      if (authState.user?.uid) await setDoc(doc(db, ...APP_SETTINGS_PATH), cleanPayload).catch(() => {});
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

      <div className="settings-grid">
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
          <input value={form.adminPasscode || ""} onChange={(event) => updateField("adminPasscode", event.target.value)} />
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
      </div>

      <div className="settings-actions">
        <button type="button" onClick={saveSettings} disabled={busy}><Save size={18} /> 설정 저장</button>
      </div>
    </section>
  );
}
