import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/server/session";
import { Wordmark } from "@/shared/ui/wordmark";

/** Renders nothing; bounces people who already have a session into the app. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(var(--fw-line-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--fw-line-subtle)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-18rem] size-[36rem] -translate-x-1/2 rounded-full bg-accent opacity-[0.06] blur-3xl"
      />
      <main className="relative flex w-full max-w-[22.5rem] flex-col gap-8 animate-fade-in">
        <Wordmark className="self-center" />
        {children}
      </main>
    </div>
  );
}
