"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Card from "@/components/Card";
import Tabs from "@/components/Tabs";
import { fetchModels, submitInferJob, submitTrainJob } from "@/lib/api";
import { JOB_STATUS_LABELS } from "@/lib/jobs";
import type { JobSummary, ModelItem, PriorityPref } from "@/app/types";


const PRECISIONS = ["FP16", "INT8", "FP32"];
const PRIORITIES: { value: PriorityPref; label: string }[] = [
  { value: "time", label: "시간 우선" },
  { value: "cost", label: "비용 우선" },
  { value: "balanced", label: "균형" },
];

export default function NewJobPage() {
  const router = useRouter();

  const [jobType, setJobType] = useState("train");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelId, setModelId] = useState<number | null>(null);
  const [batch, setBatch] = useState(128);
  const [precision, setPrecision] = useState("FP16");
  const [priority, setPriority] = useState<PriorityPref>("time");
  const [slaTarget, setSlaTarget] = useState(99);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
        if (m.length > 0) setModelId(m[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const handleSubmit = async () => {
    if (modelId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const base = {
        model_id: modelId,
        batch,
        precision,
        priority_pref: priority,
      };
      const job =
        jobType === "train"
          ? await submitTrainJob(base)
          : await submitInferJob({ ...base, sla_target: slaTarget });
      setResult(job);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 제출 완료 화면
  if (result) {
    const admitted = result.status === "running";
    return (
      <main style={{ padding: "24px 28px" }}>
        <Breadcrumb
          segments={[
            { label: "지도", onClick: () => router.push("/") },
            { label: "작업 목록", onClick: () => router.push("/jobs") },
            { label: "제출 완료" },
          ]}
        />

        <div style={{ maxWidth: 520, marginTop: 24 }}>
          <Card>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: admitted ? "var(--accent)" : "#F59E0B",
                fontFamily: "'IBM Plex Mono', monospace",
                marginBottom: 10,
              }}
            >
              {admitted ? "ADMITTED" : "QUEUED"}
            </div>

            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {result.model_name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--sub)", marginBottom: 18 }}>
              {admitted
                ? "여유 자원이 있어 즉시 배정되었습니다."
                : "현재 여유 자원이 없어 대기열에 등록되었습니다."}
            </div>

            <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.9 }}>
              <div>상태 · {JOB_STATUS_LABELS[result.status] ?? result.status}</div>
              <div>배치 · {result.batch}</div>
              <div>정밀도 · {result.precision}</div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => router.push(`/jobs/${result.id}`)} style={primaryBtn}>
                작업 상세 보기
              </button>
              <button onClick={() => setResult(null)} style={secondaryBtn}>
                새 작업 제출
              </button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/") },
          { label: "작업 목록", onClick: () => router.push("/jobs") },
          { label: "작업 제출" },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>작업 제출</div>
        <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
          모델과 실행 조건을 선택하세요
        </div>
      </div>

      <Tabs
        items={[
          { id: "train", label: "학습" },
          { id: "infer", label: "추론" },
        ]}
        active={jobType}
        onChange={setJobType}
      />

      <div style={{ maxWidth: 520 }}>
        <Card>
          <Field label="모델">
            <select
              value={modelId ?? ""}
              onChange={(e) => setModelId(Number(e.target.value))}
              style={inputStyle}
              disabled={models.length === 0}
            >
              {models.length === 0 && <option value="">모델 불러오는 중…</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type})
                </option>
              ))}
            </select>
          </Field>

          <Field label="배치 크기">
            <input
              type="number"
              min={1}
              value={batch}
              onChange={(e) => setBatch(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>

          <Field label="정밀도">
            <div style={{ display: "flex", gap: 8 }}>
              {PRECISIONS.map((p) => (
                <ChoiceButton
                  key={p}
                  label={p}
                  active={precision === p}
                  onClick={() => setPrecision(p)}
                />
              ))}
            </div>
          </Field>

          <Field label="우선순위">
            <div style={{ display: "flex", gap: 8 }}>
              {PRIORITIES.map((p) => (
                <ChoiceButton
                  key={p.value}
                  label={p.label}
                  active={priority === p.value}
                  onClick={() => setPriority(p.value)}
                />
              ))}
            </div>
          </Field>

          {jobType === "infer" && (
            <Field label="SLA 목표 (%)">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={slaTarget}
                onChange={(e) => setSlaTarget(Number(e.target.value))}
                style={inputStyle}
              />
            </Field>
          )}

          {error && (
            <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 14 }}>
              제출 실패: {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || modelId === null}
            style={primaryBtn}
          >
            {submitting ? "제출 중…" : "작업 제출"}
          </button>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--sub)",
          marginBottom: 8,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
        background: active ? "rgba(99,102,241,.14)" : "transparent",
        color: active ? "var(--accent)" : "var(--sub)",
        borderRadius: 8,
        padding: "7px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--ink)",
  fontFamily: "inherit",
  fontSize: 13,
};

const primaryBtn: React.CSSProperties = {
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 18px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 700,
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--sub)",
  borderRadius: 8,
  padding: "10px 18px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
};