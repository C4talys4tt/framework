"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { fieldErrorsFrom } from "@/shared/lib/action-result";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { authClient, describeAuthError } from "../auth-client";
import { safeRedirectPath, signInSchema } from "../domain/credentials";
import { FormError } from "./auth-card";

export function SignInForm() {
  const next = safeRedirectPath(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({ email: data.get("email"), password: data.get("password") });
    setFormError(undefined);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signIn.email(parsed.data);
      if (error) {
        setFormError(describeAuthError(error));
        setPending(false);
        return;
      }
      // Deliberate full page load: it discards every cached, session-scoped route.
      window.location.assign(next);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Email" name="email" type="email" autoComplete="email" autoFocus required error={fieldErrors.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fieldErrors.password} />
      <Button type="submit" variant="primary" size="lg" pending={pending} className="mt-1">
        Sign in
      </Button>
    </form>
  );
}
