import { useState } from "react";
import anyaImage from "/anya-nobg.png";

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === "Test") {
      setCookie("starlight_session", "ok", 30);
      onSuccess();
    } else {
      setError("Wrong password! (｡•́︿•̀｡)");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setPassword("");
    }
  }

  return (
    <div className="login-root">
      <div className="login-card" style={{ animation: shake ? "shake 0.5s" : undefined }}>
        <img src={anyaImage} alt="Anya" className="login-anya" />
        <h1 className="login-title">✦ Project Starlight ✦</h1>
        <p className="login-sub">Enter the secret password ✨</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password…"
            className="login-input"
            autoFocus
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn">
            Enter ✦
          </button>
        </form>
      </div>
    </div>
  );
}
