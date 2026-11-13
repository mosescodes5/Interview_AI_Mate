import { useEffect, useState } from "react";
import { BarChart3, BriefcaseBusiness, ChevronLeft, ChevronRight, Code2, Eye, EyeOff, FileText, History as HistoryIcon, LayoutDashboard, MessagesSquare, Mic2, MonitorUp, Settings as Cog, ShieldCheck, Wrench } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { Interview } from "./components/Interview";
import { Technical } from "./pages/Technical";
import { Coding } from "./pages/Coding";
import { ProfilePage } from "./pages/Profile";
import { Jobs } from "./pages/Jobs";
import { History } from "./pages/History";
import { AnalyticsPage } from "./pages/Analytics";
import { SettingsPage } from "./pages/SettingsPage";
import { ModelStatus } from "./components/ModelStatus";
import { LiveCopilot } from "./pages/LiveCopilot";

const NAV = [
  ["dashboard", "Dashboard", LayoutDashboard], ["live", "Live Interview Copilot", MonitorUp], ["practice", "Interview Practice", MessagesSquare], ["micro1", "Micro1 Practice", Mic2], ["turing", "Turing Practice", Mic2], ["mercor", "Mercor Practice", Mic2],
  ["technical", "Technical Interviews", Wrench], ["coding", "Coding Practice", Code2], ["profile", "CV and Profile", FileText],
  ["jobs", "Job Descriptions", BriefcaseBusiness], ["history", "Session History", HistoryIcon], ["analytics", "Performance Analytics", BarChart3],
  ["settings", "Settings", Cog],
] as const;

export default function App() {
  const [page, setPage] = useState<string>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [sharePrivacy, setSharePrivacy] = useState(false);
  const [nativeProtection, setNativeProtection] = useState(false);
  const [nativeProtectionKnown, setNativeProtectionKnown] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.getContentProtection().then((enabled) => {
      setNativeProtection(enabled);
      setNativeProtectionKnown(true);
    }).catch(() => setNativeProtectionKnown(false));
  }, []);

  const toggleScreenShareProtection = async () => {
    const api = window.electronAPI;
    if (api) {
      try {
        const enabled = await api.setContentProtection(!nativeProtection);
        setNativeProtection(enabled);
      } catch {
        // Keep the browser cover as a fallback if the native bridge is unavailable.
        setSharePrivacy((value) => !value);
      }
      return;
    }
    setSharePrivacy((value) => !value);
  };

  useEffect(() => {
    if (!sharePrivacy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSharePrivacy(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sharePrivacy]);
  const title = NAV.find((n) => n[0] === page)![1];

  const view = () => {
    switch (page) {
      case "live": return <LiveCopilot />;
      case "practice": return <Interview title="Interview Practice" intro="General mock interview. No CV or job description needed." />;
      case "micro1": return <Interview preset="micro1" title="Micro1 Practice" intro="Independent practice simulator inspired by AI-led recruitment interviews. It is NOT an official Micro1 integration and does not access any real assessment." />;
      case "turing": return <Interview preset="turing" title="Turing Practice" intro="Independent practice simulator for developer-vetting style screenings. NOT affiliated with Turing and it does not access any real assessment. Use it to prepare beforehand, not during a live test." />;
      case "mercor": return <Interview preset="mercor" title="Mercor Practice" intro="Independent practice simulator for AI-led screening interviews. NOT affiliated with Mercor and it does not access any real assessment. Use it to prepare beforehand, not during a live interview." />;
      case "technical": return <Technical />;
      case "coding": return <Coding />;
      case "profile": return <ProfilePage />;
      case "jobs": return <Jobs />;
      case "history": return <History />;
      case "analytics": return <AnalyticsPage />;
      case "settings": return <SettingsPage />;
      default: return <Dashboard go={setPage} />;
    }
  };

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">{collapsed ? "IM" : "InterviewMate AI"}</div>
        {NAV.map(([id, label, Icon]) => (
          <button key={id} className={`nav ${page === id ? "active" : ""}`} onClick={() => setPage(id)} aria-current={page === id ? "page" : undefined} title={label}>
            <Icon size={18} aria-hidden /> {!collapsed && <span>{label}</span>}
          </button>
        ))}
        <button className="nav toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> <span>Collapse</span></>}
        </button>
      </nav>
      <main>
        <header>
          <h1>{title}</h1>
          <div className="header-actions">
            <button className={`btn small ${(nativeProtection || sharePrivacy) ? "primary" : ""}`} onClick={toggleScreenShareProtection} aria-pressed={nativeProtection || sharePrivacy}>
              {(nativeProtection || sharePrivacy) ? <><Eye size={15} /> Allow screen capture</> : <><EyeOff size={15} /> Hide from screen share</>}
            </button>
            {nativeProtectionKnown && nativeProtection && <span className="pill" title="Native operating-system screen capture protection is enabled"><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Capture protected</span>}
            <ModelStatus />
          </div>
        </header>
        <div className="content" key={page}>{view()}</div>
      </main>
      {sharePrivacy && (
        <div className="share-privacy-cover" role="dialog" aria-modal="true" aria-label="Screen share privacy is enabled">
          <div className="share-privacy-card">
            <ShieldCheck size={34} />
            <h2>Privacy screen enabled</h2>
            <p>This browser-only privacy cover hides the page content. For whole-screen capture protection, launch the native InterviewMate desktop app.</p>
            <button className="btn primary" onClick={() => setSharePrivacy(false)}><Eye size={16} /> Show app again</button>
            <span className="share-privacy-hint">Press Esc to reveal the page. Browser mode cannot exclude its window from operating-system screen capture.</span>
          </div>
        </div>
      )}
    </div>
  );
}
