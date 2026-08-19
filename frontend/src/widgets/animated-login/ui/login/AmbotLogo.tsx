import styles from "./LoginPanel.module.css";

/**
 * The Ambot365 mark: a conversation bubble whose tail doubles as the rising
 * line the CRM draws on the other half of the page. Same idea, two places.
 */
export function AmbotLogo() {
  return (
    <div className={styles.logo}>
      <span className={styles.logoMark} aria-hidden>
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M16 4c6.6 0 12 4.3 12 9.7 0 5.3-5.4 9.6-12 9.6-1.3 0-2.6-.2-3.8-.5l-6 3.2 1.5-5A9.2 9.2 0 0 1 4 13.7C4 8.3 9.4 4 16 4Z"
            fill="url(#ambot-logo-fill)"
          />
          <path
            d="M10.5 15.6l3.4-3.5 3.1 3 4.5-4.7"
            stroke="#fff"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="ambot-logo-fill" x1="4" y1="4" x2="28" y2="26">
              <stop stopColor="#1DFFB2" />
              <stop offset="1" stopColor="#16C784" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className={styles.logoText}>
        <strong>Ambot365</strong>
        <small>CRM Automation Services</small>
      </span>
    </div>
  );
}
