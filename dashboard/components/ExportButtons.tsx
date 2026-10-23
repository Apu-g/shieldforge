import { DownloadIcon } from "./icons";

const FORMATS = [
  { id: "pdf", label: "PDF" },
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
] as const;

export function ExportButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`export-buttons${compact ? " is-compact" : ""}`}>
      {FORMATS.map((format) => (
        <a
          key={format.id}
          className={`btn ${format.id === "pdf" ? "btn-primary" : "btn-ghost"} btn-sm`}
          href={`/api/export/cert-in?format=${format.id}`}
          download
        >
          <DownloadIcon size={14} />
          {format.label}
        </a>
      ))}
    </div>
  );
}
