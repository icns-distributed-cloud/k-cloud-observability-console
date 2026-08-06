"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import Stepper from "@/components/Stepper";
import Tabs from "@/components/Tabs";
import ModelGraph from "@/components/ModelGraph";
import { fetchDatasets, fetchModelLayers, fetchModels, fetchResourceTiers, submitInferJob, submitTrainJob } from "@/lib/api";
import { JOB_STATUS_LABELS, tierMix } from "@/lib/jobs";
import type {
    DatasetItem,
    ModelItem,
    ModelLayersResponse,
    PriorityPref,
    ResourceTierItem,
    JobSummary,
} from "@/app/types";

const STEPS = ["작업 정보", "모델 분석", "자원 선택", "제출 완료"];

/** 인증이 없으므로 CSC 포털의 "로그인된" 사용자를 고정한다 (시드의 csc-user-01) */
const CURRENT_USER_ID = 1;

export interface WizardForm {
    jobType: "train" | "infer";
    modelId: number | null;
    datasetId: number | null;
    batch: number;
    priorityPref: PriorityPref;
    tierId: number | null;
}

const INITIAL_FORM: WizardForm = {
    jobType: "train",
    modelId: null,
    datasetId: null,
    batch: 128,
    priorityPref: "time",
    tierId: null,
};

const PRIORITIES: { value: PriorityPref; label: string; desc: string }[] = [
    { value: "time", label: "시간 우선", desc: "성능이 높은 자원부터" },
    { value: "cost", label: "비용 우선", desc: "단가가 낮은 자원부터" },
    { value: "balanced", label: "균형", desc: "성능과 비용을 함께" },
];

export default function JobWizardPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<WizardForm>(INITIAL_FORM);

    const patch = (v: Partial<WizardForm>) => setForm((f) => ({ ...f, ...v }));
    const [models, setModels] = useState<ModelItem[]>([]);
    const [datasets, setDatasets] = useState<DatasetItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchModels()
            .then((m) => {
                setModels(m);
                if (m.length > 0) setForm((f) => ({ ...f, modelId: m[0].id }));
            })
            .catch((e) => setError(String(e)));
    }, []);

    // 모델을 고르면 그 모델용 데이터셋만 다시 받아온다 (학습 작업에만 쓰인다)
    useEffect(() => {
        if (form.modelId === null) return;
        fetchDatasets(form.modelId)
            .then((d) => {
                setDatasets(d);
                setForm((f) => ({ ...f, datasetId: d.length > 0 ? d[0].id : null }));
            })
            .catch(() => setDatasets([]));
    }, [form.modelId]);

    const [layers, setLayers] = useState<ModelLayersResponse | null>(null);

    // 모델 분석 단계에 들어갈 때만 레이어를 받는다 (1단계에서 모델을 바꿀 수 있으므로)
    useEffect(() => {
        if (step !== 1 || form.modelId === null) return;
        setLayers(null);
        fetchModelLayers(form.modelId)
            .then(setLayers)
            .catch(() => setLayers(null));
    }, [step, form.modelId]);

    const [tiers, setTiers] = useState<ResourceTierItem[] | null>(null);

    // 자원 선택 단계에 들어갈 때 조회한다. 정렬은 백엔드가 priority_pref를 보고 해주므로
    // 프론트는 받은 순서대로 그리고 첫 번째를 추천으로 표시하면 된다.
    useEffect(() => {
        if (step !== 2) return;
        setTiers(null);
        fetchResourceTiers(form.jobType, form.priorityPref)
            .then((list) => {
                setTiers(list);
                // 이전 단계에서 우선순위를 바꿨을 수 있으니 추천 Tier로 다시 맞춘다
                setForm((f) => ({ ...f, tierId: list.length > 0 ? list[0].id : null }));
            })
            .catch((e) => {
                setTiers([]);
                setError(String(e));
            });
    }, [step, form.jobType, form.priorityPref]);

    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<JobSummary | null>(null);

    const handleSubmit = async () => {
        if (form.modelId === null || form.tierId === null) return;
        setSubmitting(true);
        setError(null);
        try {
            const base = {
                model_id: form.modelId,
                batch: form.batch,
                priority_pref: form.priorityPref,
                tier_id: form.tierId,
                user_id: CURRENT_USER_ID,
            };
            const job =
                form.jobType === "train"
                    ? await submitTrainJob({
                          ...base,
                          ...(form.datasetId !== null && { dataset_id: form.datasetId }),
                      })
                    : await submitInferJob(base);
            setResult(job);
            // 스케줄러에서 방금 제출한 작업 막대를 잠깐 강조하기 위한 표식
            sessionStorage.setItem("kcloud:lastSubmittedJobId", String(job.id));
            sessionStorage.setItem("kcloud:lastSubmittedAt", String(Date.now()));
            setStep(3);
        } catch (e) {
            setError(String(e));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main style={{ padding: "24px 28px" }}>
            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>작업 제출</div>
                <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                    모델과 실행 조건을 선택하면 가용 자원을 추천해 드립니다
                </div>
            </div>

            <Stepper steps={STEPS} current={step} />

            <div style={{ maxWidth: 640 }}>
                <Card>
                    {step === 0 ? (
                        <>
                            <Tabs
                                items={[
                                    { id: "train", label: "학습" },
                                    { id: "infer", label: "추론" },
                                ]}
                                active={form.jobType}
                                onChange={(id) => patch({ jobType: id as "train" | "infer" })}
                            />

                            <Field label="모델">
                                <select
                                    value={form.modelId ?? ""}
                                    onChange={(e) => patch({ modelId: Number(e.target.value) })}
                                    style={inputStyle}
                                    disabled={models.length === 0}
                                >
                                    {models.length === 0 && <option value="">불러오는 중…</option>}
                                    {models.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} ({m.type})
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            {/* 데이터셋은 학습에만 필요하다 — 추론은 이미 학습된 모델을 쓴다 */}
                            {form.jobType === "train" && (
                                <Field label="데이터셋">
                                    <select
                                        value={form.datasetId ?? ""}
                                        onChange={(e) => patch({ datasetId: Number(e.target.value) })}
                                        style={inputStyle}
                                        disabled={datasets.length === 0}
                                    >
                                        {datasets.length === 0 && (
                                            <option value="">사용 가능한 데이터셋 없음</option>
                                        )}
                                        {datasets.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            <Field label="배치 크기">
                                <input
                                    type="number"
                                    min={1}
                                    value={form.batch}
                                    onChange={(e) => patch({ batch: Number(e.target.value) })}
                                    style={inputStyle}
                                />
                            </Field>

                            <Field label="우선순위">
                                <div style={{ display: "flex", gap: 8 }}>
                                    {PRIORITIES.map((p) => (
                                        <button
                                            key={p.value}
                                            onClick={() => patch({ priorityPref: p.value })}
                                            style={{
                                                flex: 1,
                                                textAlign: "left",
                                                border: `1px solid ${form.priorityPref === p.value ? "var(--accent)" : "var(--line)"
                                                    }`,
                                                background: "transparent",
                                                borderRadius: 8,
                                                padding: "10px 12px",
                                                cursor: "pointer",
                                                fontFamily: "inherit",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                    color:
                                                        form.priorityPref === p.value
                                                            ? "var(--accent)"
                                                            : "var(--ink)",
                                                }}
                                            >
                                                {p.label}
                                            </div>
                                            <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 3 }}>
                                                {p.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            {error && (
                                <div style={{ fontSize: 12, color: "var(--alert-critical)" }}>
                                    불러오기 실패: {error}
                                </div>
                            )}
                        </>
                    ) : step === 1 ? (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                                {models.find((m) => m.id === form.modelId)?.name ?? "모델"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 16 }}>
                                레이어 → 노드 연산 그래프
                            </div>
                            {layers && layers.layers.length > 0 ? (
                                <ModelGraph layers={layers.layers} edges={layers.edges} />
                            ) : (
                                <div
                                    style={{
                                        padding: 32,
                                        textAlign: "center",
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                    }}
                                >
                                    {layers === null ? "불러오는 중…" : "레이어 정보가 없습니다."}
                                </div>
                            )}
                        </>
                    ) : step === 2 ? (
                        <>
                            <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 16 }}>
                                {PRIORITIES.find((p) => p.value === form.priorityPref)?.label} 기준으로
                                정렬했습니다
                            </div>

                            {tiers === null ? (
                                <div
                                    style={{
                                        padding: 32,
                                        textAlign: "center",
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                    }}
                                >
                                    불러오는 중…
                                </div>
                            ) : tiers.length === 0 ? (
                                <div
                                    style={{
                                        padding: 32,
                                        textAlign: "center",
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                    }}
                                >
                                    선택 가능한 자원 구성이 없습니다.
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {tiers.map((t, i) => {
                                        const selected = form.tierId === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => patch({ tierId: t.id })}
                                                style={{
                                                    textAlign: "left",
                                                    border: `1px solid ${
                                                        selected ? "var(--accent)" : "var(--line)"
                                                    }`,
                                                    background: "transparent",
                                                    borderRadius: 10,
                                                    padding: "14px 16px",
                                                    cursor: "pointer",
                                                    fontFamily: "inherit",
                                                    color: "var(--ink)",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>
                                                        Tier {t.tier_no}
                                                    </span>
                                                    {/* 백엔드가 추천순으로 정렬해 주므로 첫 번째가 추천이다 */}
                                                    {i === 0 && (
                                                        <span
                                                            style={{
                                                                fontSize: 10.5,
                                                                fontWeight: 700,
                                                                letterSpacing: "0.06em",
                                                                color: "#fff",
                                                                background: "var(--accent)",
                                                                borderRadius: 4,
                                                                padding: "2px 6px",
                                                                fontFamily: "'IBM Plex Mono', monospace",
                                                            }}
                                                        >
                                                            추천
                                                        </span>
                                                    )}
                                                    <span
                                                        style={{
                                                            marginLeft: "auto",
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                            color: t.available
                                                                ? "var(--active)"
                                                                : "var(--alert-warning)",
                                                            fontFamily: "'IBM Plex Mono', monospace",
                                                        }}
                                                    >
                                                        {t.available ? "즉시 가용" : "대기 예상"}
                                                    </span>
                                                </div>

                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 20,
                                                        fontSize: 12.5,
                                                        color: "var(--sub)",
                                                        fontFamily: "'IBM Plex Mono', monospace",
                                                    }}
                                                >
                                                    <span>{tierMix(t)}</span>
                                                    <span>{Number(t.cost_per_hour).toFixed(1)} credit/h</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : result ? (
                        <>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    color:
                                        result.status === "running"
                                            ? "var(--active)"
                                            : "var(--alert-warning)",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    marginBottom: 10,
                                }}
                            >
                                {result.status === "running" ? "ADMITTED" : "QUEUED"}
                            </div>

                            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                                {result.model_name}
                            </div>
                            <div style={{ fontSize: 12.5, color: "var(--sub)", marginBottom: 18 }}>
                                {result.status === "running"
                                    ? "여유 자원이 있어 즉시 배정되었습니다."
                                    : "현재 여유 자원이 없어 대기열에 등록되었습니다."}
                            </div>

                            <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.9 }}>
                                <div>작업 번호 · J-{result.id}</div>
                                <div>상태 · {JOB_STATUS_LABELS[result.status] ?? result.status}</div>
                                {result.selected_tier && (
                                    <div>
                                        자원 · Tier {result.selected_tier.tier_no} (
                                        {tierMix(result.selected_tier)})
                                    </div>
                                )}
                                {result.dataset_name && <div>데이터셋 · {result.dataset_name}</div>}
                                <div>배치 · {result.batch}</div>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: 8, fontSize: 13, color: "var(--sub)" }}>
                            제출 중…
                        </div>
                    )}
                </Card>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                {step === 3 ? (
                    <>
                        <button onClick={() => router.push("/csc/jobs")} style={primaryBtn}>
                            내 작업으로
                        </button>
                        <button
                            onClick={() => {
                                setResult(null);
                                setForm(INITIAL_FORM);
                                setStep(0);
                            }}
                            style={secondaryBtn}
                        >
                            새 작업 제출
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => (step === 0 ? router.push("/csc/jobs") : setStep(step - 1))}
                            style={secondaryBtn}
                        >
                            {step === 0 ? "취소" : "이전"}
                        </button>
                        {step === 2 ? (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || form.tierId === null}
                                style={{
                                    ...primaryBtn,
                                    opacity: submitting || form.tierId === null ? 0.5 : 1,
                                }}
                            >
                                {submitting ? "제출 중…" : "작업 제출"}
                            </button>
                        ) : (
                            <button
                                onClick={() => setStep(step + 1)}
                                disabled={step === 0 && form.modelId === null}
                                style={{
                                    ...primaryBtn,
                                    opacity: step === 0 && form.modelId === null ? 0.5 : 1,
                                }}
                            >
                                다음
                            </button>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

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