"use server";

import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// PDF + common image types, mapped to a file extension for the stored object.
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Upload an expense-claim receipt for a supplier invoice. Called from the
 * supplier invoice editor. The file is stored in the private `receipts` bucket
 * and the returned path is saved on the line item when the invoice is saved.
 */
export async function uploadReceipt(
  formData: FormData
): Promise<{ path?: string; name?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "You're not signed in." };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const file = formData.get("file");
  if (!invoiceId) return { error: "Missing invoice reference." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_BYTES) return { error: "Receipt must be 10 MB or smaller." };

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return { error: "Receipt must be a PDF or an image (PNG, JPG, WEBP)." };

  // Authorize against the invoice via RLS: only the owning supplier leader (or
  // HR) can read it. Reject uploads once the invoice is locked/paid.
  const supabase = createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { error: "Invoice not found or not yours to edit." };
  if (inv.status === "locked" || inv.status === "paid") {
    return { error: "This invoice is locked and can no longer be edited." };
  }

  const admin = createAdminClient();
  const path = `${invoiceId}/${randomBytes(9).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from("receipts")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };

  return { path, name: file.name };
}
