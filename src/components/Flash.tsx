import { Alert } from "@/components/ui/Feedback";

/** Renders success/error banners from ?ok= / ?error= search params. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-5">
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <Alert tone="success">{ok}</Alert>
      )}
    </div>
  );
}
