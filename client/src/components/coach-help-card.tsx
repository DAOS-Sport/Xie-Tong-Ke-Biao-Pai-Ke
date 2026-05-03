/**
 * 員工操作說明卡片 — 可依頁面傳入不同的說明內容。
 * 預設收合，點標題展開，不干擾主要功能。
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, ChevronDown, ChevronUp, Lightbulb, AlertTriangle } from "lucide-react";

export interface HelpStep {
  title: string;
  desc: string;
  sub?: string[];
  tip?: string;
  warn?: string;
}

export interface HelpSection {
  title: string;
  icon: string;
  steps: HelpStep[];
}

interface CoachHelpCardProps {
  sections: HelpSection[];
  defaultOpen?: boolean;
}

function StepItem({ step, index }: { step: HelpStep; index: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
        {index + 1}
      </div>
      <div className="flex-1 pb-4">
        <p className="font-medium text-sm text-foreground mb-0.5">{step.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
        {step.sub && (
          <ul className="mt-1.5 space-y-1">
            {step.sub.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
        {step.tip && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-2.5 py-1.5">
            <Lightbulb className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-green-700 leading-relaxed">{step.tip}</p>
          </div>
        )}
        {step.warn && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">{step.warn}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoachHelpCard({ sections, defaultOpen = false }: CoachHelpCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeSection, setActiveSection] = useState(0);

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <HelpCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="flex-1">使用說明</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-blue-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-blue-500" />
          )}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="px-4 pt-0 pb-4">
          {/* Section tabs (when multiple sections) */}
          {sections.length > 1 && (
            <div className="flex gap-1 flex-wrap mb-4">
              {sections.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSection(i)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeSection === i
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-blue-200 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  <i className={`fas ${s.icon} text-xs`}></i>
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {/* Steps */}
          <div>
            {sections[activeSection]?.steps.map((step, i) => (
              <StepItem key={i} step={step} index={i} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
