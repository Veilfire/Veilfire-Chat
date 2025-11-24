import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

interface BasicAuthAdapter {
  getUserByEmail(email: string): Promise<{ id?: string } | null>;
  createUser(user: {
    name?: string | null;
    email?: string | null;
    emailVerified?: Date | null;
    password?: string | null;
  }): Promise<unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);

    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const body = raw as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
    };

    const nameRaw = typeof body.name === "string" ? body.name.trim() : "";
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const passwordRaw = typeof body.password === "string" ? body.password : "";

    if (!emailRaw || !passwordRaw) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailRaw)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const nameRegex = /^[A-Za-z]{1,32}$/;
    if (nameRaw && !nameRegex.test(nameRaw)) {
      return NextResponse.json(
        { error: "Name must be 1-32 alphabetic characters (A-Z only)." },
        { status: 400 }
      );
    }

    if (
      passwordRaw.length < 16 ||
      !/[a-z]/.test(passwordRaw) ||
      !/[A-Z]/.test(passwordRaw) ||
      !/[0-9]/.test(passwordRaw) ||
      !/[^A-Za-z0-9]/.test(passwordRaw)
    ) {
      return NextResponse.json(
        {
          error:
            "Password must be at least 16 characters and include uppercase, lowercase, number, and special character.",
        },
        { status: 400 }
      );
    }

    if (!authOptions.adapter) {
      return NextResponse.json(
        { error: "Auth adapter not configured." },
        { status: 500 }
      );
    }

    const adapter = authOptions.adapter as BasicAuthAdapter;

    const existing = await adapter.getUserByEmail(emailRaw);
    if (existing) {
      return NextResponse.json(
        { error: "User with that email already exists." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(passwordRaw, 10);

    await adapter.createUser({
      name: nameRaw || emailRaw,
      email: emailRaw,
      emailVerified: null,
      password: hashed,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Registration failed." },
      { status: 500 }
    );
  }
}
