import type { AlertItem } from "@/lib/AlertContext";

/** 토스트(AutoAlert)와 종 아이콘 드롭다운(AlertBell)이 같은 문구를 쓰므로 한 곳에 둔다. */
export function alertTitle(alert: AlertItem): string {
  return alert.kind === "warning" ? "WARNING: SLA 기준 초과" : `ERROR: ${alert.reason}`;
}

export function alertColor(alert: AlertItem): string {
  return alert.kind === "warning" ? "var(--alert-warning)" : "var(--alert-critical)";
}

export function AlertBody({ alert, color }: { alert: AlertItem; color: string }) {
  return (
    <>
      {alert.typeLabel} 작업{" "}
      <strong style={{ color: "var(--accent)" }}>
        J-{alert.jobId} ({alert.modelName})
      </strong>
      {alert.kind === "warning" ? (
        <>
          의 처리가 SLA 기준보다
          <span style={{ color, fontWeight: "bold" }}> {alert.delaySec}초</span> 지연되고 있습니다.
        </>
      ) : (
        <>
          가 <span style={{ color, fontWeight: "bold" }}>{alert.reason}</span>(으)로 예기치 않게 종료되었습니다.
        </>
      )}
    </>
  );
}
