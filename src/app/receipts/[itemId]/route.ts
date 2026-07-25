import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stream a line-item receipt via a short-lived signed URL. Authorization piggy-
 * backs on RLS: the caller can only read the line item (and thus its receipt)
 * if they own the invoice or are HR. The bucket stays private; we never expose
 * the raw storage path.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const supabase = createClient();
  const { data: item } = await supabase
    .from("invoice_line_items")
    .select("receipt_path")
    .eq("id", params.itemId)
    .maybeSingle();

  const path = (item?.receipt_path ?? "").trim();
  if (!path) {
    return new NextResponse("Receipt not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("receipts")
    .createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    return new NextResponse("Receipt not found.", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
