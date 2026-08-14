import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuthStore } from "../../features/auth/model/auth-store";
import { ApiError } from "../../shared/api/client";
import { Button, Field, IconButton, Input } from "../../shared/ui";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  full_name: z.string().optional(),
  org_name: z.string().optional(),
});

const registerSchema = loginSchema.extend({
  password: z.string().min(8, "Use at least 8 characters"),
  full_name: z.string().min(1, "Enter your name"),
  org_name: z.string().min(1, "Name your workspace"),
});

type FormData = z.infer<typeof loginSchema>;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const createAccount = useAuthStore((state) => state.register);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(mode === "login" ? loginSchema : registerSchema),
    defaultValues: { email: "", password: "", full_name: "", org_name: "" },
  });

  const submit = async (data: FormData) => {
    setFormError(null);
    try {
      if (mode === "login") {
        await login(data.email, data.password);
      } else {
        await createAccount({
          email: data.email,
          password: data.password,
          full_name: data.full_name ?? "",
          org_name: data.org_name ?? "",
        });
      }
      navigate("/builder", { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Can't reach the local API",
      );
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand-band">
        <div className="brand-mark">
          <Bot size={24} aria-hidden />
          <span>WebChatBots</span>
        </div>
        <div className="auth-brand-copy">
          <p>Conversation builder</p>
          <h1>Design support flows that stay understandable.</h1>
          <div className="auth-flow-preview" aria-hidden="true">
            <span className="preview-node preview-node--start">Start</span>
            <i />
            <span className="preview-node">Welcome</span>
            <i />
            <span className="preview-node preview-node--branch">Route</span>
          </div>
        </div>
        <span className="local-badge">Local PostgreSQL</span>
      </section>

      <section className="auth-form-band">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span>{mode === "login" ? "Welcome back" : "Create workspace"}</span>
            <h2>{mode === "login" ? "Sign in to the builder" : "Start building locally"}</h2>
          </div>

          <form className="auth-form" onSubmit={handleSubmit(submit)}>
            {mode === "register" ? (
              <div className="form-two-col">
                <Field label="Your name" error={errors.full_name?.message}>
                  <Input
                    autoComplete="name"
                    adornment={<UserRound size={17} aria-hidden />}
                    {...register("full_name")}
                  />
                </Field>
                <Field label="Workspace" error={errors.org_name?.message}>
                  <Input
                    autoComplete="organization"
                    adornment={<Bot size={17} aria-hidden />}
                    {...register("org_name")}
                  />
                </Field>
              </div>
            ) : null}

            <Field label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                adornment={<Mail size={17} aria-hidden />}
                {...register("email")}
              />
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
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

            {formError ? (
              <div className="form-error" role="alert">
                {formError}
              </div>
            ) : null}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "New to WebChatBots?" : "Already have an account?"}{" "}
            <Link to={mode === "login" ? "/register" : "/login"}>
              {mode === "login" ? "Create account" : "Sign in"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
