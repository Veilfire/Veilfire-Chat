"use client";

import Image from "next/image";
import { FormEvent, useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginPageInner() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    const errorParam = searchParams?.get("error");
    if (errorParam === "CredentialsSignin") {
      setError("Invalid email or password.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    const res = await signIn("credentials", {
      redirect: false,
      email: trimmedEmail,
      password,
    });
    if (res && !res.ok) {
      setError("Invalid email or password.");
    } else {
      router.replace("/");
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
          <div className="w-full max-w-md bg-slate-950/90 border border-slate-800 rounded-xl p-6 shadow-xl">
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
          Veilfire Chat – Sign in
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md px-2 py-1">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-sky-600 hover:bg-sky-500 transition-colors px-3 py-2 text-sm font-medium"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-400 text-center">
          No account?{" "}
          <button
            className="text-sky-400 hover:text-sky-300 underline"
            onClick={() => router.push("/auth/register")}
          >
            Register
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
