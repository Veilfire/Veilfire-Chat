"use client";

import { FormEvent, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function RegisterPage() {
  const { status } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    const nameRegex = /^[A-Za-z]{1,32}$/;
    if (!nameRegex.test(trimmedName)) {
      setError("Name must be 1-32 alphabetic characters (A-Z only).");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (
      password.length < 16 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError(
        "Password must be at least 16 characters and include uppercase, lowercase, number, and special character."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        router.push("/auth/login");
      }
    } catch (err) {
      console.error(err);
      setError("Registration failed. Check server logs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="flex justify-center mb-4">
              <Image
                  src="/images/veilfire-logo.png"
                  alt="Veilfire Chat"
                  width={120}
                  height={64}
                  className="rounded-lg"
                  priority
              />
          </div>
        <h1 className="text-xl font-semibold mb-4 text-center">
            Veilfire Chat – Register
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            Name
            <input
              className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Confirm Password
            <input
              className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md px-2 py-1">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-sky-600 hover:bg-sky-500 transition-colors px-3 py-2 text-sm font-medium disabled:bg-slate-700"
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400 text-center">
          Already have an account?{" "}
          <button
            className="text-sky-400 hover:text-sky-300 underline"
            onClick={() => router.push("/auth/login")}
          >
            Sign in
          </button>
        </p>
      </div>
      <div className="fixed bottom-4 right-4 flex flex-col items-center gap-1 text-xs text-slate-400">
        <Image
          src="/images/veilfire-logo.png"
          alt="Veilfire Chat"
          width={80}
          height={40}
          className="rounded-md"
          priority
        />
        <div className="px-3 py-1 rounded-full border border-slate-700 bg-slate-950/90 shadow-lg">
          Made in Canada <span className="ml-1">🇨🇦</span>
        </div>
      </div>
    </div>
  );
}
