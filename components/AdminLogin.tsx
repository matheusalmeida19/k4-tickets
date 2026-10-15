"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icons";
import { requestJson } from "./Format";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <form className="login-card" onSubmit={submit}>
      <span className="state-icon">
        <Icon name="lock" size={25} />
      </span>
      <p className="eyebrow">ÁREA RESTRITA</p>
      <h1>Administração.</h1>
      <p className="muted">Acesso exclusivo à equipe autorizada do K4.</p>
      <div className="field">
        <label htmlFor="admin-email">E-mail</label>
        <input
          type="email"
          name="email"
          id="admin-email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="admin-password">Senha</label>
        <input
          type="password"
          name="password"
          id="admin-password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button className="button button-primary button-full" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
        <Icon name="arrow" />
      </button>
      <p className="small muted login-provision">
        O primeiro administrador precisa ser provisionado pelo responsável
        técnico. Não há cadastro público.
      </p>
    </form>
  );
}
