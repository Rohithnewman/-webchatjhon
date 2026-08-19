import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuthStore } from "../../../../features/auth/model/auth-store";
import { ApiError } from "../../../../shared/api/client";
import { Button, Field, IconButton, Input } from "../../../../shared/ui";
import styles from "./LoginPanel.module.css";

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

type LoginValues = z.infer<typeof schema>;

/**
 * The login form.
 *
 * Deliberately the least animated thing on the page: it is the reason anyone is
 * here. It reuses the shared UI kit unchanged — the Ambot palette reaches it
 * through the token overrides on the panel, not through a second set of inputs.
 */
export function LoginForm({ onNotice }: { onNotice: (message: string) => void }) {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (values: LoginValues) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate("/builder", { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Can't reach the Ambot365 API",
      );
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(submit)} noValidate>
      <Field label="Email Address" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          adornment={<Mail size={17} aria-hidden />}
          {...register("email")}
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Your password"
          adornment={<LockKeyhole size={17} aria-hidden />}
          trailing={
            <IconButton
              size="sm"
              label={showPassword ? "Hide password" : "Show password"}
              icon={showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              onClick={() => setShowPassword((value) => !value)}
            />
          }
          {...register("password")}
        />
      </Field>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.textLink}
          onClick={() =>
            onNotice("Password reset isn't available yet. Ask your workspace admin to reset it.")
          }
        >
          Forgot Password?
        </button>
      </div>

      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
        Login
      </Button>
    </form>
  );
}
