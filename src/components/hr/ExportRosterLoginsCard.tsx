"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export function ExportRosterLoginsCard({ supplierId }: { supplierId: string }) {
  return (
    <Card>
      <CardHeader
        title="Export logins for the leader"
        description="A Word document with every roster member's portal link, User ID and password — ready to email to the supplier's leader."
      />
      <CardBody>
        <p className="mb-3 text-sm text-ink-600">
          This creates a login for anyone who doesn&apos;t have one yet and sets a{" "}
          <span className="font-medium">fresh password for everyone</span> — any
          existing password is reset (passwords can&apos;t be read back once set).
        </p>
        <form
          action={`/hr/suppliers/${supplierId}/roster-logins`}
          method="post"
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Generate a new password for every roster member and download the Word document? Existing passwords will be reset."
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <Button type="submit" variant="neutral">
            Generate &amp; download (Word)
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
