import { useState } from "react";
import { Link } from "react-router-dom";

import { AmbotLogo } from "./AmbotLogo";
import { LoginForm } from "./LoginForm";
import styles from "./LoginPanel.module.css";
import { SocialLogin } from "./SocialLogin";

/** The stable half of the page. Nothing here animates on a loop. */
export function LoginPanel() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section className={styles.panel}>
      <div className={styles.inner}>
        <AmbotLogo />

        <header className={styles.heading}>
          <h1>Welcome Back!</h1>
          <p>Login to manage your conversations, customers and grow your business.</p>
        </header>

        <LoginForm onNotice={setNotice} />

        <div className={styles.divider}>
          <span>or continue with</span>
        </div>

        <SocialLogin
          onUnavailable={(provider) =>
            setNotice(`${provider} sign-in isn't connected yet. Use your email and password.`)
          }
        />

        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}

        <p className={styles.signup}>
          Don&apos;t have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </section>
  );
}
