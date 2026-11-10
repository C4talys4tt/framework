import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { SignUpForm } from "@/modules/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

const linkClass = "font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent";

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="One workspace for the whole creative process."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
