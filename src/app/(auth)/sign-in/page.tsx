import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { SignInForm } from "@/modules/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const linkClass = "font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent";

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Pick up where you left off."
      footer={
        <>
          New to FRAMEWORK?{" "}
          <Link href="/sign-up" className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      {/* The form reads ?next= from the URL, which is only known per request. */}
      <Suspense fallback={<div className="h-[13.5rem]" />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
