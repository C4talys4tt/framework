"use client";

import { useRef, useState, type FormEvent } from "react";
import { authClient, describeAuthError } from "@/modules/auth/auth-client";
import { PASSWORD_MIN_LENGTH, changePasswordSchema } from "@/modules/auth/domain/credentials";
import { fieldErrorsFrom } from "@/shared/lib/action-result";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { SaveStatus, type SaveState } from "./save-status";

export function ChangePasswordForm({ email }: { email: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: data.get("currentPassword"),
      newPassword: data.get("newPassword"),
    });
    setState({ kind: "idle" });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { error } = await authClient.changePassword({ ...parsed.data, revokeOtherSessions: true });
      if (error) {
        if (error.code === "INVALID_PASSWORD") setFieldErrors({ currentPassword: describeAuthError(error) });
        else setState({ kind: "error", message: describeAuthError(error) });
        return;
      }
      formRef.current?.reset();
      setState({ kind: "saved", message: "Password changed" });
    } catch {
      setState({ kind: "error", message: "Could not change your password. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {/* Lets password managers associate the new password with the account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.currentPassword}
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. Other devices will be signed out.`}
      />
      <div className="flex items-center justify-end gap-4">
        <SaveStatus state={state} />
        <Button type="submit" variant="primary" pending={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}
