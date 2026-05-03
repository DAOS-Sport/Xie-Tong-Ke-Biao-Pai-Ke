import { useState } from "react";
import { useLocation } from "wouter";

export type ActiveTab =
  | "coach-view"
  | "venue-schedule"
  | "class-edit"
  | "assign"
  | "stats"
  | "approval"
  | "weekly-push"
  | "sop"
  | "coach-portal";

interface NavItem {
  key: ActiveTab;
  label: string;
  icon: string;
  path: string;
  subLabel?: string;
  isGreen?: boolean;
}

const navItems: NavItem[] = [
  { key: "coach-view", label: "教練視圖", icon: "fa-user-clock", path: "/coach" },
  { key: "venue-schedule", label: "場館課表顯示", icon: "fa-building", path: "/venue-schedule" },
  { key: "class-edit", label: "學校課表編輯", icon: "fa-edit", path: "/mgt-x9k7p2/class-edit", subLabel: "第一階段" },
  { key: "assign", label: "教練指派", icon: "fa-user-plus", path: "/mgt-x9k7p2/assign", subLabel: "第二階段" },
  { key: "stats", label: "堂數統計", icon: "fa-chart-bar", path: "/mgt-x9k7p2/stats" },
  { key: "approval", label: "教練審核", icon: "fa-user-check", path: "/mgt-x9k7p2/approval" },
  { key: "weekly-push", label: "週推播", icon: "fa-paper-plane", path: "/mgt-x9k7p2/weekly-push" },
  { key: "sop", label: "操作說明 SOP", icon: "fa-book-open", path: "/mgt-x9k7p2/sop" },
  { key: "coach-portal", label: "教練前台", icon: "fa-door-open", path: "/coach-portal", isGreen: true },
];

const SIDEBAR_COLLAPSED_W = 56;
const SIDEBAR_EXPANDED_W = 208;

interface AdminLayoutProps {
  activeTab: ActiveTab;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

export default function AdminLayout({
  activeTab,
  headerCenter,
  headerRight,
  rightPanel,
  children,
}: AdminLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useLocation();

  const handleNav = (path: string) => {
    setExpanded(false);
    setLocation(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Click-away overlay when sidebar is expanded */}
      {expanded && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Left Sidebar — absolute overlay */}
      <div
        className="absolute left-0 top-0 bottom-0 z-20 flex flex-col bg-card border-r border-border shadow-lg transition-all duration-200"
        style={{ width: expanded ? `${SIDEBAR_EXPANDED_W}px` : `${SIDEBAR_COLLAPSED_W}px` }}
      >
        {/* Toggle button */}
        <button
          className="h-14 flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0 border-b border-border"
          style={{ width: `${SIDEBAR_COLLAPSED_W}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <i
            className={`fas ${expanded ? "fa-chevron-left" : "fa-bars"} text-muted-foreground text-sm`}
          ></i>
        </button>

        {/* Nav items */}
        <nav className="flex-1 py-1">
          {navItems.map((item) => {
            const isActive = item.key === activeTab;
            const isGreen = !!item.isGreen;
            const tooltipLabel = item.subLabel
              ? `${item.label} (${item.subLabel})`
              : item.label;

            return (
              <button
                key={item.key}
                /* relative so the absolute tooltip is positioned against this button */
                className={`relative w-full flex items-center gap-3 py-3 text-sm font-medium transition-colors whitespace-nowrap group
                  ${isActive
                    ? isGreen
                      ? "bg-green-50 text-green-700 border-l-2 border-green-500"
                      : "bg-blue-50 text-primary border-l-2 border-primary"
                    : isGreen
                      ? "text-green-600 hover:bg-green-50"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                style={{ paddingLeft: isActive ? "14px" : "16px", paddingRight: "12px" }}
                onClick={() => handleNav(item.path)}
              >
                <i
                  className={`fas ${item.icon} text-sm flex-shrink-0 text-center`}
                  style={{ width: "20px" }}
                ></i>

                {/* Label — only visible when expanded */}
                {expanded && (
                  <span className="truncate text-left">
                    {item.label}
                    {item.subLabel && (
                      <span className="text-xs ml-1 opacity-60">({item.subLabel})</span>
                    )}
                  </span>
                )}

                {/* Hover tooltip when collapsed */}
                {!expanded && (
                  <span
                    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2
                               px-2.5 py-1.5 rounded-md text-xs font-normal whitespace-nowrap
                               bg-white text-gray-900 shadow-md border border-gray-200
                               opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    style={{ zIndex: 9999 }}
                  >
                    {tooltipLabel}
                    {/* Arrow pointing left */}
                    <span
                      className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
                      style={{ borderRightColor: "#ffffff" }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main area — padded left to account for collapsed sidebar width */}
      <div
        className="flex flex-col flex-1 min-w-0 min-h-0"
        style={{ paddingLeft: `${SIDEBAR_COLLAPSED_W}px` }}
      >
        {/* Header */}
        <header className="h-14 bg-card border-b border-border shadow-sm flex items-center px-4 gap-3 flex-shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <i className="fas fa-swimming-pool text-primary text-lg"></i>
            <span className="text-base font-bold text-primary whitespace-nowrap hidden sm:inline">
              五泳池課表整合系統
            </span>
          </div>

          {/* Center controls */}
          {headerCenter && (
            <div className="flex-1 flex justify-center items-center gap-2 min-w-0 overflow-x-auto">
              {headerCenter}
            </div>
          )}

          {/* Right controls */}
          {headerRight && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {headerRight}
            </div>
          )}
        </header>

        {/* Body row */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          <main className="flex-1 overflow-auto min-w-0">
            {children}
          </main>
          {rightPanel && (
            <aside className="w-64 flex-shrink-0 overflow-y-auto border-l border-border bg-background">
              {rightPanel}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
