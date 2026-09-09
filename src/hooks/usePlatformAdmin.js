import { useEffect, useState } from "react";
import { db, doc, getDoc } from "../firebase.js";

export function usePlatformAdmin(user) {
  const [access, setAccess] = useState({ uid: "", allowed: false, loading: true });
  useEffect(() => {
    let active = true;
    if (!user || user.isAnonymous) { setAccess({ uid: "", allowed: false, loading: false }); return; }
    setAccess({ uid: user.uid, allowed: false, loading: true });
    getDoc(doc(db, "platformAdmins", user.uid)).then((snapshot) => {
      if (active) setAccess({ uid: user.uid, allowed: snapshot.exists() && snapshot.data().enabled === true, loading: false });
    }).catch(() => { if (active) setAccess({ uid: user.uid, allowed: false, loading: false }); });
    return () => { active = false; };
  }, [user?.uid]);
  return { allowed: access.uid === user?.uid && access.allowed, loading: access.loading };
}
