"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient, describeAuthError } from "@/modules/auth/auth-client";
import { NAME_MAX_LENGTH, profileSchema } from "@/modules/auth/domain/credentials";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { SaveStatus, type SaveState } from "./save-status";

export function ProfileForm({ name: savedName, email }: { name: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(savedName);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = profileSchema.safeParse({ name });
    setState({ kind: "idle" });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    try {
      const { error } = await authClient.updateUser({ name: parsed.data.name });
      if (error) {
        setState({ kind: "error", message: describeAuthError(error) });
        return;
      }
      setName(parsed.data.name);
      setState({ kind: "saved", message: "Profile saved" });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Could not save your profile. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Display name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="name"
        required
        error={fieldError}
      />
      <Field label="Email" name="email" type="email" value={email} readOnly hint="Changing your email address is not supported yet." />
      <div className="flex items-center justify-end gap-4">
        <SaveStatus state={state} />
        <Button type="submit" variant="primary" pending={pending} disabled={name.trim() === savedName}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
