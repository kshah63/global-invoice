import { BrandWordmark } from "@/components/BrandMark";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <BrandWordmark />
        <h2 className="mt-8 text-2xl font-semibold text-ink-900">
          Set a new password
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Choose a new password for your account.
        </p>
        <div className="mt-6">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
