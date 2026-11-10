"use client";

import { useState, type FormEvent } from "react";
import { fieldErrorsFrom } from "@/shared/lib/action-result";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { authClient, describeAuthError } from "../auth-client";
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, signUpSchema } from "../domain/credentials";
import { FormError } from "./auth-card";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: data.get("name"),
      email: data.get("email"),
      password: data.get("password"),
    });
    setFormError(undefined);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { error } = await authClient.signUp.email(parsed.data);
      if (error) {
        setFormError(describeAuthError(error));
        setPending(false);
        return;
      }
      // Deliberate full page load: it discards every cached, session-scoped route.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Name" name="name" autoComplete="name" maxLength={NAME_MAX_LENGTH} autoFocus required error={fieldErrors.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      <Button type="submit" variant="primary" size="lg" pending={pending} className="mt-1">
        Create account
      </Button>
    </form>
  );
}
