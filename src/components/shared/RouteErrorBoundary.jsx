import { Component } from "react";
import { useLocation } from "react-router-dom";

export class ScreenErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    console.error("BIZQUEST 화면 오류", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="mx-auto my-12 max-w-lg rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">화면을 불러오지 못했습니다.</h1>
      <p className="my-4 text-slate-600">저장된 참여 정보는 유지됩니다. 다시 시도하거나 방 코드로 재입장해 주세요.</p>
      <div className="flex gap-3"><button className="rounded-xl bg-slate-900 px-4 py-3 text-white" onClick={() => window.location.reload()}>다시 시도</button><a className="rounded-xl border px-4 py-3" href="/">메인에서 재입장</a></div>
    </main>;
  }
}

export default function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ScreenErrorBoundary key={location.pathname + location.search}>{children}</ScreenErrorBoundary>;
}
